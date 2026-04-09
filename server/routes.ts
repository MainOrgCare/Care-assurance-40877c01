import type { Express, Request, Response, NextFunction } from "express";
import {
  apiSuccess,
  apiError,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  apiTooManyRequests,
  apiInternalError,
  apiCreated,
} from "./utils/apiResponse";
import express from "express";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import os from "node:os";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pkg from "pg";
const { Pool } = pkg;
import { z } from "zod";

// Extracted route modules (incremental migration from monolith)
import {
  registerHandoverRoutes,
  registerTrainingRoutes,
  registerPolicyAcknowledgementRoutes,
  registerClientErrorRoutes,
  registerMessageRoutes,
  registerGdprRoutes,
  registerContactRoutes,
  registerExtensionRoutes,
  registerAiUsageRoutes,
  registerSystemLogRoutes,
  registerDashboardRoutes,
  registerCareWorkerRoutes,
  registerPolicyDocumentRoutes,
  registerAdminPortalRoutes,
  registerEmailAssistantRoutes,
} from "./routes/index";
import { insertUserSchema, insertCareWorkerSchema, insertDiscrepancySchema, insertAuditSchema, insertPolicyDocumentSchema, insertSystemLogSchema, type RiskAssessmentLog, type AnalyzedServiceUser, type WorkbookUpload } from "@shared/schema";
import { getPreferredProvider, setPreferredProvider, setLocalLLMUrl, getPreferredModel, getUseEmarAgent, setUseEmarAgent, getUseAICache, setUseAICache, getUseRulesFirst, setUseRulesFirst, getAILiteMode, setAILiteMode, getRequireLiveWebForLocal, setRequireLiveWebForLocal, isLocalLLMAvailable, getLocalLLMUrl, getLocalLLMModel, ensureSettingsLoaded, isAIEnabled, setAIEnabled, getAIDisabledMessage, getAiErrorStatusCode, type AiUserContext, type AiProvider } from "./services/aiClient";
import { getCacheStats, clearCache } from "./services/aiCache";
import { analyzeRiskLevel, calculatePlanQuality, extractCommonFields, shouldUseAI, extractMedicationInfo, extractPersonalCareNeeds, extractContinenceInfo, extractNutritionInfo, extractEnvironmentInfo } from "./services/ruleBasedEngine";
import { emarAgent, inferRequiredGapHoursFromText } from "./services/emarAgent";
import { careWorkerRotaPayloadSchema, computeRotaSourceHash, rotaWeekdayEnum } from "./services/careWorkerRota";
import multer from "multer";
import { upload, uploadExcel, uploadImages } from "./utils/uploadConfig";
import {
  BILLING_DAY_KEYS,
  type BillingDayKey,
  type BillingDayCounts,
  normalizeDate,
  addDays,
  differenceInDays,
  startOfWeekMonday,
  parseDateInput,
  formatDate,
  parseInteger,
  normalizeTime,
  parseTimeToMinutes,
  parseDurationMinutes,
  formatDurationFromMinutes,
  getBillingDayIndex,
  getBillingDayKey,
  getWeekIndex,
  parseJsonFromModel,
} from "./utils/billingHelpers";
import mammoth from "mammoth";
import { scanFile } from "./services/fileScan";
import { SafeXLSX, RawXLSX } from "./utils/safe-xlsx";
import { analyzeBillingRows } from "./services/billingAnalyzer";
import { extractSupportPlanDataFromText, compareSupportPlanToServiceOrders, type ServiceOrderComparisonInput } from "./services/supportPlanCompare";
import { geocodeAddress } from "./services/geocoding";
import rateLimit from "express-rate-limit";
import { runComplianceAgent } from "./services/emarComplianceAgent";

// Use legacy build for Node.js (no DOM APIs required)
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseEMARGrid, type ParsedEMAR } from "./emarGridParser";
import { extractFromRawCalls, getExpiryDate, type RawCallRecord } from "./services/serviceOrderBuilder";
import { getPgPoolConfig } from "./utils/pgPoolConfig";
import { validatePlanEnhancerResponse, autoCorrectPlanEnhancerResponse, generateValidationReport } from "./utils/planEnhancerValidator";
import { executeSecureChatCompletion, executeSecureTextCompletion } from "./utils/secureAiPipeline";
import {
  validatePassword,
  getLoginAttemptKey,
  pruneLoginAttempts,
  getBlockedSeconds,
  recordLoginFailure,
  clearLoginFailures,
} from "./utils/passwordPolicy";
// Vision-based extraction for improved EMAR accuracy

const execFileAsync = promisify(execFile);

const MAX_NON_ADMIN_SESSIONS = 2;
const FORCE_LOGOUT_WARNING_SECONDS = 30;

const formatZodErrors = (errors: z.ZodIssue[]): Array<{ field: string; message: string }> =>
  errors.map((issue) => ({
    field: issue.path.length ? issue.path.join(".") : "root",
    message: issue.message,
  }));

const getStandardFontDataUrl = (): string => {
  const fontsPath = path.resolve(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
  return pathToFileURL(fontsPath + path.sep).toString();
};

async function extractPdfTextWithPdfjs(pdfBuffer: Buffer): Promise<{ text: string; pageCount: number; pageCharCounts: number[]; pageTexts: string[] }> {
  const uint8Array = new Uint8Array(pdfBuffer);
  const loadingTask = getDocument({
    data: uint8Array,
    disableWorker: true,
    standardFontDataUrl: getStandardFontDataUrl(),
    useSystemFonts: true,
  } as any);
  const pdf = await loadingTask.promise;

  const pageCharCounts: number[] = [];
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Preserve row-ish structure by grouping items with similar Y and sorting by X.
    const viewport = page.getViewport({ scale: 1.0 });
    type Positioned = { str: string; x: number; y: number };
    const positioned: Positioned[] = [];

    for (const item of textContent.items as any[]) {
      const str = typeof item?.str === "string" ? item.str : "";
      if (!str.trim()) continue;
      const tx = item?.transform;
      if (!Array.isArray(tx) || tx.length < 6) {
        positioned.push({ str, x: 0, y: 0 });
        continue;
      }
      const x = tx[4];
      const y = viewport.height - tx[5];
      positioned.push({ str, x, y });
    }

    positioned.sort((a, b) => (a.y - b.y) || (a.x - b.x));

    const yTolerance = 2.5;
    const rows: Positioned[][] = [];
    let currentRow: Positioned[] = [];
    let currentY: number | null = null;

    for (const token of positioned) {
      if (currentY === null || Math.abs(token.y - currentY) <= yTolerance) {
        currentRow.push(token);
        if (currentY === null) currentY = token.y;
      } else {
        rows.push(currentRow);
        currentRow = [token];
        currentY = token.y;
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);

    const lines = rows
      .map((row) =>
        row
          .sort((a, b) => a.x - b.x)
          .map((segment) => segment.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean);

    const pageText = lines.join("\n");
    pageCharCounts.push(pageText.length);
    pageTexts.push(pageText);
  }

  const combined = pageTexts.join("\n\n--- PAGE BREAK ---\n\n");
  return { text: combined, pageCount: pdf.numPages, pageCharCounts, pageTexts };
}

const tryConvertOfficeToPdf = async (buffer: Buffer, originalName: string): Promise<Buffer | null> => {
  const ext = path.extname(originalName).toLowerCase();
  if (![".doc", ".docx"].includes(ext)) return null;

  let tempDir: string | null = null;
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "support-plan-"));
    const inputPath = path.join(tempDir, `input${ext || ".docx"}`);
    await fs.writeFile(inputPath, buffer);

    const runConversion = async (command: string): Promise<Buffer | null> => {
      try {
        await execFileAsync(command, ["--headless", "--convert-to", "pdf", "--outdir", tempDir!, inputPath], {
          timeout: 15000,
        });
        const pdfPath = path.join(tempDir!, "input.pdf");
        const pdfBuffer = await fs.readFile(pdfPath);
        return pdfBuffer;
      } catch {
        return null;
      }
    };

    const pdfBuffer = (await runConversion("soffice")) || (await runConversion("libreoffice"));
    return pdfBuffer;
  } catch {
    return null;
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
};

// Virus scanning helper - scans file, logs result, creates admin alert if threat detected
async function scanAndLogFile(
  file: Express.Multer.File,
  uploadType: string,
  scannedBy?: string
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const scanResult = await scanFile({
      filename: file.originalname,
      size: file.size,
      buffer: file.buffer,
    });

    const canLogScan = Boolean(process.env.DATABASE_URL);
    if (canLogScan) {
      try {
        await storage.createFileScanLog({
          fileName: file.originalname,
          fileHash: scanResult.fileHash,
          fileSize: file.size,
          scanResult: scanResult.scanResult,
          threatsFound: scanResult.threatsFound,
          scannedBy: scannedBy || null,
          uploadType,
          cachedResult: scanResult.cached,
        });
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("File scan log failed in development; continuing without log.");
        } else {
          throw error;
        }
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.warn("DATABASE_URL not set - skipping file scan log");
    }

    if (!scanResult.isClean) {
      console.error(
        `[SECURITY ALERT] Threat detected in file "${file.originalname}": ${scanResult.threatsFound}. Upload blocked by ${scannedBy || "unknown user"}.`
      );

      return {
        allowed: false,
        error: `File rejected: Security threat detected. The file "${file.originalname}" contains malware and cannot be uploaded.`,
      };
    }

    return { allowed: true };
  } catch (error: any) {
    console.error("Virus scan error:", error);
    return {
      allowed: false,
      error: `File scan failed: ${safeErrorMessage(error, "unknown error")}. Please try again later.`,
    };
  }
}

const BILLING_EXTRACTION_PROMPT = `You are extracting rows from a "Service Requirement Details" table in a care service order screenshot.

Return JSON ONLY with this shape:
{
  "rows": [
    {
      "startDate": "DD/MM/YYYY",
      "endDate": "DD/MM/YYYY" | null,
      "startTime": "HH:MM" | null,
      "endTime": "HH:MM" | null,
      "duration": "00:30m" | "01:00h" | null,
      "mon": number,
      "tue": number,
      "wed": number,
      "thu": number,
      "fri": number,
      "sat": number,
      "sun": number,
      "occursEveryWeeks": number,
      "serviceType": string | null
    }
  ]
}

CRITICAL EXTRACTION RULES:

1. TABLE STRUCTURE: The table has columns: Start date, End date, Start time, End time, Duration, Mon qty, Tue qty, Wed qty, Thu qty, Fri qty, Sat qty, Sun qty, Occurs every X weeks, Service & Visit type.

2. DAY QUANTITIES - READ EACH CELL INDIVIDUALLY:
   - Look at EACH day column (Mon, Tue, Wed, Thu, Fri, Sat, Sun) SEPARATELY for every row.
   - If a cell contains a number (1, 2, 3, etc.), use that exact number.
   - If a cell is BLANK/EMPTY (no number visible), use 0.
   - IMPORTANT: Different rows often have DIFFERENT patterns - some rows only have values on certain days.
   - Example: A row might have Mon=0, Tue=2, Wed=0, Thu=2, Fri=0, Sat=0, Sun=0 (only Tue and Thu have values).

3. DO NOT assume patterns - read what is actually shown in each cell.

4. DATES: Keep DD/MM/YYYY format. If end date is blank, use null.

5. DURATION: Extract as shown (e.g., "00:30m", "01:00h", "01:30h").

6. SERVICE TYPE: Extract from the "Service & Visit type" column (e.g., "Extra Care - AM", "Extra Care - Lunch").

7. OCCURS EVERY WEEKS: Usually 1, but check the column for each row.

8. Each visible table row = one object in the rows array.
`;

async function extractRowsFromBillingImage(
  file: Express.Multer.File,
  imageIndex: number,
  userContext: AiUserContext
): Promise<any[]> {
  const base64 = file.buffer.toString("base64");
  const mimeType = file.mimetype || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const preferredModel = getPreferredModel();
  const fallbackModel = "gpt-4.1-mini";

  const runExtraction = async (model: string) =>
    executeSecureTextCompletion({
      endpoint: "/api/billing-tool/extract-image",
      feature: "billing-tool-extract",
      model,
      userContext,
      systemPrompt: "You extract structured data from images.",
      userContent: [
        { type: "text", text: BILLING_EXTRACTION_PROMPT },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ],
      temperature: 0,
      maxCompletionTokens: 1600,
      useCache: false,
    });

  let completion;
  try {
    completion = await runExtraction(preferredModel);
  } catch (error: any) {
    if (preferredModel !== fallbackModel) {
      console.warn(
        `[Billing Tool] Preferred model failed for image ${imageIndex + 1}. Falling back to ${fallbackModel}.`,
        error?.message || error
      );
      completion = await runExtraction(fallbackModel);
    } else {
      throw error;
    }
  }

  const content = completion.restoredText || "";
  if (!content.trim()) return [];
  const parsed = parseJsonFromModel(content);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  throw new Error("Model response did not return any rows");
}

const connectedClients: Map<string, WebSocket> = new Map();
let sessionStore: any = null;

/**
 * Never leak raw error.message to the client — it can contain
 * database connection strings, SQL errors, file paths, and internal service details.
 * Only expose raw messages in explicit development mode.
 */
const safeErrorMessage = (error: unknown, fallback = "Internal server error"): string => {
  if (process.env.NODE_ENV === "development") {
    return (error instanceof Error ? error.message : String(error)) || fallback;
  }
  return fallback;
};

const PLATFORM_CONTROLS_KEY = "platform_controls";
const PLATFORM_CONTROLS_CACHE_TTL_MS = 10_000;
const DEFAULT_MAINTENANCE_MESSAGE =
  "Platform maintenance in progress. Some write actions are temporarily unavailable.";

type PlatformAnnouncementSeverity = "info" | "warning" | "critical";

type PlatformControls = {
  maintenanceMode: boolean;
  readOnlyMode: boolean;
  maintenanceMessage: string;
  maintenanceWindowStart: string | null;
  maintenanceWindowEnd: string | null;
  announcementEnabled: boolean;
  announcementText: string;
  announcementSeverity: PlatformAnnouncementSeverity;
  updatedAt: string;
  updatedBy: string | null;
};

const PLATFORM_CONTROLS_FALLBACK: Omit<PlatformControls, "updatedAt" | "updatedBy"> = {
  maintenanceMode: false,
  readOnlyMode: false,
  maintenanceMessage: DEFAULT_MAINTENANCE_MESSAGE,
  maintenanceWindowStart: null,
  maintenanceWindowEnd: null,
  announcementEnabled: false,
  announcementText: "",
  announcementSeverity: "info",
};

const platformControlsStoredSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  readOnlyMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(280).optional(),
  maintenanceWindowStart: z.string().max(64).nullable().optional(),
  maintenanceWindowEnd: z.string().max(64).nullable().optional(),
  announcementEnabled: z.boolean().optional(),
  announcementText: z.string().max(280).optional(),
  announcementSeverity: z.enum(["info", "warning", "critical"]).optional(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().nullable().optional(),
});

const platformControlsPatchSchema = z
  .object({
    maintenanceMode: z.boolean().optional(),
    readOnlyMode: z.boolean().optional(),
    maintenanceMessage: z.string().max(280).optional(),
    maintenanceWindowStart: z.string().max(64).nullable().optional(),
    maintenanceWindowEnd: z.string().max(64).nullable().optional(),
    announcementEnabled: z.boolean().optional(),
    announcementText: z.string().max(280).optional(),
    announcementSeverity: z.enum(["info", "warning", "critical"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting must be provided",
  });

let platformControlsCache: PlatformControls | null = null;
let platformControlsCachedAt = 0;

const sanitizePlatformText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 280);
};

const normalizeIsoDateTime = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const getPlatformControlsRuntime = (controls: PlatformControls) => {
  const now = Date.now();
  const windowStartMs = controls.maintenanceWindowStart
    ? Date.parse(controls.maintenanceWindowStart)
    : Number.NaN;
  const windowEndMs = controls.maintenanceWindowEnd
    ? Date.parse(controls.maintenanceWindowEnd)
    : Number.NaN;
  const hasScheduledWindow =
    Number.isFinite(windowStartMs) &&
    Number.isFinite(windowEndMs) &&
    windowEndMs > windowStartMs;
  const maintenanceWindowActive = hasScheduledWindow
    ? now >= windowStartMs && now <= windowEndMs
    : false;
  const maintenanceWindowUpcoming = hasScheduledWindow ? now < windowStartMs : false;

  return {
    hasScheduledWindow,
    maintenanceWindowActive,
    maintenanceWindowUpcoming,
    maintenanceActive: controls.maintenanceMode || maintenanceWindowActive,
    readOnlyActive: controls.readOnlyMode || maintenanceWindowActive,
  };
};

const normalizePlatformControls = (value: unknown): PlatformControls => {
  const nowIso = new Date().toISOString();
  const parsed = platformControlsStoredSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ...PLATFORM_CONTROLS_FALLBACK,
      updatedAt: nowIso,
      updatedBy: null,
    };
  }

  const data = parsed.data;
  const maintenanceMessage =
    sanitizePlatformText(data.maintenanceMessage) || DEFAULT_MAINTENANCE_MESSAGE;
  const maintenanceWindowStart = normalizeIsoDateTime(data.maintenanceWindowStart ?? null);
  const maintenanceWindowEnd = normalizeIsoDateTime(data.maintenanceWindowEnd ?? null);
  const hasCompleteWindow = Boolean(maintenanceWindowStart && maintenanceWindowEnd);
  const hasValidWindow =
    hasCompleteWindow &&
    new Date(maintenanceWindowEnd as string).getTime() >
      new Date(maintenanceWindowStart as string).getTime();
  const announcementText = sanitizePlatformText(data.announcementText);
  const updatedAt =
    data.updatedAt && !Number.isNaN(Date.parse(data.updatedAt)) ? data.updatedAt : nowIso;
  const updatedBy =
    typeof data.updatedBy === "string" && data.updatedBy.trim().length > 0
      ? data.updatedBy
      : null;

  return {
    maintenanceMode: Boolean(data.maintenanceMode),
    readOnlyMode: Boolean(data.readOnlyMode),
    maintenanceMessage,
    maintenanceWindowStart: hasValidWindow ? maintenanceWindowStart : null,
    maintenanceWindowEnd: hasValidWindow ? maintenanceWindowEnd : null,
    announcementEnabled: Boolean(data.announcementEnabled),
    announcementText,
    announcementSeverity: data.announcementSeverity ?? "info",
    updatedAt,
    updatedBy,
  };
};

const getPlatformControls = async (forceRefresh = false): Promise<PlatformControls> => {
  const isFresh = Date.now() - platformControlsCachedAt < PLATFORM_CONTROLS_CACHE_TTL_MS;
  if (!forceRefresh && platformControlsCache && isFresh) {
    return platformControlsCache;
  }

  const rawValue = await storage.getAppSetting(PLATFORM_CONTROLS_KEY);
  if (!rawValue) {
    platformControlsCache = {
      ...PLATFORM_CONTROLS_FALLBACK,
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    };
    platformControlsCachedAt = Date.now();
    return platformControlsCache;
  }

  try {
    platformControlsCache = normalizePlatformControls(JSON.parse(rawValue));
  } catch {
    platformControlsCache = normalizePlatformControls(null);
  }
  platformControlsCachedAt = Date.now();
  return platformControlsCache;
};

const updatePlatformControls = async (
  patch: Partial<PlatformControls>,
  updatedBy?: string | null
): Promise<PlatformControls> => {
  const current = await getPlatformControls();
  const next = normalizePlatformControls({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? null,
  });

  await storage.setAppSetting(PLATFORM_CONTROLS_KEY, JSON.stringify(next), updatedBy ?? undefined);
  platformControlsCache = next;
  platformControlsCachedAt = Date.now();
  return next;
};

// ═══════════════════════════════════════════════════════════════════════════
// PII SCRUBBING - UK GDPR COMPLIANT ANONYMIZATION
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════

type SecurityEventType = 
  | 'PII_SCRUB' | 'PII_RESTORE' | 'AI_REQUEST' | 'INPUT_VALIDATION' 
  | 'RATE_LIMIT' | 'AUTH_FAILURE' | 'SUSPICIOUS_INPUT'
  | 'LOGIN_FAILED' | 'LOGIN_BLOCKED' | 'IP_BLOCKED' | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET' | 'ACCOUNT_SUSPENDED' | 'CSRF_BLOCKED' | 'SESSION_CREATED';

interface SecurityAuditLog {
  timestamp: string;
  eventType: SecurityEventType;
  endpoint: string;
  userId?: string | number | null;
  username?: string | null;
  ipAddress?: string;
  details: Record<string, any>;
}

/**
 * Log security-relevant events for compliance and monitoring
 * Persists to database for UK GDPR audit trail compliance
 */
function logSecurityEvent(event: Omit<SecurityAuditLog, 'timestamp'>): void {
  const log: SecurityAuditLog = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  
  // Always log to console for immediate visibility
  if (process.env.NODE_ENV === 'production' || process.env.SECURITY_AUDIT_LOG === 'true') {
    console.log(`[SECURITY] ${JSON.stringify(log)}`);
  }
  
  // Persist to database asynchronously (fire-and-forget for performance)
  // For PII-related events and auth events that need audit trail
  const gdprEvents = ['PII_SCRUB', 'PII_RESTORE', 'AI_REQUEST', 'DATA_EXPORT', 'DATA_DELETE', 'CONSENT_CHANGE'];
  const authEvents = ['LOGIN_FAILED', 'LOGIN_BLOCKED', 'IP_BLOCKED', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'CSRF_BLOCKED'];
  
  if (gdprEvents.includes(event.eventType)) {
    storage.createGdprAuditLog({
      eventType: event.eventType,
      endpoint: event.endpoint,
      userId: typeof event.userId === 'number' ? String(event.userId) : event.userId || undefined,
      username: event.username || undefined,
      ipAddress: event.ipAddress,
      piiCategories: event.details?.categories || undefined,
      piiItemCount: event.details?.totalItems || undefined,
      details: event.details,
    }).catch((err) => {
      console.error('[SECURITY] Failed to persist GDPR audit log:', err.message);
    });
  }
  
  // Log auth-related security events to system log
  if (authEvents.includes(event.eventType)) {
    storage.createSystemLog({
      eventType: `security_${event.eventType.toLowerCase()}`,
      userId: event.userId ? String(event.userId) : null,
      username: event.username || null,
      serviceUserInitials: null,
      details: {
        ...event.details,
        endpoint: event.endpoint,
        ipAddress: event.ipAddress,
        timestamp: log.timestamp,
      },
    }).catch((err) => {
      console.error('[SECURITY] Failed to persist system log:', err.message);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION & SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate and sanitize string input to prevent injection attacks
 * Returns sanitized string or null if input is invalid/suspicious
 */
function sanitizeStringInput(input: unknown, maxLength: number = 500000): string | null {
  if (typeof input !== 'string') return null;
  if (input.length > maxLength) return null;
  
  // Check for common injection patterns (log but don't block)
  const suspiciousPatterns = [
    /<script\b/i,
    /javascript:/i,
    /on\w+\s*=/i,  // onclick=, onerror=, etc.
    /\{\{.*\}\}/,  // Template injection (but allow our PII tokens)
    /\$\{.*\}/,    // Template literal injection
    /__proto__/i,
    /constructor\s*\(/,
  ];
  
  const hasSuspicious = suspiciousPatterns.some(p => p.test(input));
  if (hasSuspicious) {
    logSecurityEvent({
      eventType: 'SUSPICIOUS_INPUT',
      endpoint: 'input_validation',
      details: {
        inputLength: input.length,
        patterns: suspiciousPatterns.filter(p => p.test(input)).map(p => p.source),
      },
    });
  }
  
  // Basic sanitization - remove null bytes and control characters (except newlines/tabs)
  return input
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Validate JSON body fields with detailed error messages
 */
function validateRequestBody<T extends Record<string, 'string' | 'boolean' | 'number' | 'array' | 'object' | 'optional'>>(
  body: any,
  schema: T,
  endpoint: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [field, type] of Object.entries(schema)) {
    const value = body?.[field];
    const isOptional = type === 'optional';
    
    if (value === undefined || value === null) {
      if (!isOptional) {
        errors.push(`Missing required field: ${field}`);
      }
      continue;
    }
    
    // Skip type check for optional
    if (isOptional) continue;
    
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== type) {
      errors.push(`Invalid type for ${field}: expected ${type}, got ${actualType}`);
    }
  }
  
  if (errors.length > 0) {
    logSecurityEvent({
      eventType: 'INPUT_VALIDATION',
      endpoint,
      details: { errors, fieldCount: Object.keys(schema).length },
    });
  }
  
  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// PII VAULT - LOCAL CACHE FOR REVERSIBLE SCRUBBING
// ═══════════════════════════════════════════════════════════════════════════
// 
// The PII Vault enables UK GDPR compliant data processing by:
// 1. Replacing sensitive data with unique tokens before sending to AI
// 2. Storing the token->original mapping in local memory only
// 3. Restoring original values when AI response returns locally
//
// This ensures:
// - No PII is transmitted to external AI services
// - Original data never leaves the local server
// - Full fidelity restoration for local display
// ═══════════════════════════════════════════════════════════════════════════

type PIICategory = 
  | 'NHS_NUM' | 'NI_NUM' | 'POSTCODE' | 'EMAIL' | 'PHONE' 
  | 'DATE' | 'DOB' | 'AGE' | 'ADDRESS' | 'NAME' | 'STAFF' 
  | 'HEALTHCARE_PRO' | 'CONTACT' | 'FIELD'
  | 'BANK' | 'CARD' | 'LICENSE' | 'PASSPORT' | 'VEHICLE' | 'NETWORK'
  | 'LOCATION' | 'BIOGRAPHICAL' | 'HEALTH';

interface PIIVaultEntry {
  token: string;
  original: string;
  category: PIICategory;
  createdAt: number;
}

/**
 * PII Vault - Secure local cache for reversible de-identification
 * 
 * Usage:
 *   const vault = new PIIVault();
 *   const scrubbed = vault.scrub(documentContent);  // Send to AI
 *   // ... AI processing ...
 *   const restored = vault.restore(aiResponse);     // Display locally
 */
class PIIVault {
  private entries: Map<string, PIIVaultEntry> = new Map();
  private reverseMap: Map<string, string> = new Map(); // original -> token (for deduplication)
  private counter: number = 0;
  private readonly prefix: string;
  private readonly createdAt: number;
  private readonly thresholds: NarrativeThresholds;

  private static readonly PROFILE_THRESHOLDS: Record<ScrubProfile, NarrativeThresholds> = {
    strict: { autoRedact: 0.62 },
    balanced: { autoRedact: 0.7 },
    conservative: { autoRedact: 0.85 },
  };
  
  constructor(options: PIIVaultOptions = {}) {
    // Unique prefix per vault instance to avoid token collisions
    this.prefix = `PII_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    this.createdAt = Date.now();
    const profile = options.profile ?? 'balanced';
    this.thresholds = PIIVault.PROFILE_THRESHOLDS[profile];
  }
  
  /**
   * Generate a unique token for a PII value
   */
  private generateToken(category: PIICategory): string {
    this.counter++;
    return `{{${this.prefix}_${category}_${this.counter}}}`;
  }
  
  /**
   * Store a PII value and return its token
   * Deduplicates: same value returns same token
   */
  store(original: string, category: PIICategory): string {
    // Check if we already have this exact value
    const existingToken = this.reverseMap.get(original);
    if (existingToken) {
      return existingToken;
    }
    
    const token = this.generateToken(category);
    const entry: PIIVaultEntry = {
      token,
      original,
      category,
      createdAt: Date.now(),
    };
    
    this.entries.set(token, entry);
    this.reverseMap.set(original, token);
    return token;
  }
  
  /**
   * Get the original value for a token
   */
  get(token: string): string | undefined {
    return this.entries.get(token)?.original;
  }
  
  /**
   * Check if a string is a vault token
   */
  isToken(str: string): boolean {
    const escapedPrefix = this.escapeRegex(this.prefix);
    const pattern = new RegExp(`^\\{\\{${escapedPrefix}_[A-Z_]+_\\d+\\}\\}$`);
    return pattern.test(str);
  }
  
  /**
   * Get statistics about stored PII
   */
  getStats(): { total: number; byCategory: Record<PIICategory, number> } {
    const byCategory: Record<PIICategory, number> = {
      NHS_NUM: 0, NI_NUM: 0, POSTCODE: 0, EMAIL: 0, PHONE: 0,
      DATE: 0, DOB: 0, AGE: 0, ADDRESS: 0, NAME: 0, STAFF: 0,
      HEALTHCARE_PRO: 0, CONTACT: 0, FIELD: 0,
      BANK: 0, CARD: 0, LICENSE: 0, PASSPORT: 0, VEHICLE: 0, NETWORK: 0,
      LOCATION: 0, BIOGRAPHICAL: 0, HEALTH: 0,
    };
    
    for (const entry of this.entries.values()) {
      byCategory[entry.category]++;
    }
    
    return { total: this.entries.size, byCategory };
  }
  
  /**
   * Scrub a string, replacing all PII with tokens
   * Returns the scrubbed string with tokens
   */
  scrubString(data: string): string {
    let scrubbed = data;
    
    // === PHASE 1: High-confidence PII patterns ===
    
    // NHS Numbers
    scrubbed = scrubbed.replace(PII_PATTERNS.nhsNumber, (match) => this.store(match, 'NHS_NUM'));
    
    // National Insurance Numbers
    scrubbed = scrubbed.replace(PII_PATTERNS.niNumber, (match) => this.store(match, 'NI_NUM'));
    
    // UK Postcodes
    scrubbed = scrubbed.replace(PII_PATTERNS.ukPostcode, (match) => this.store(match, 'POSTCODE'));
    
    // Email addresses
    scrubbed = scrubbed.replace(PII_PATTERNS.email, (match) => this.store(match, 'EMAIL'));
    
    // Phone numbers
    scrubbed = scrubbed.replace(PII_PATTERNS.ukPhone, (match) => this.store(match, 'PHONE'));
    scrubbed = scrubbed.replace(PII_PATTERNS.intlPhone, (match) => this.store(match, 'PHONE'));
    
    // Network identifiers
    scrubbed = scrubbed.replace(PII_PATTERNS.ipAddress, (match) => this.store(match, 'NETWORK'));
    scrubbed = scrubbed.replace(PII_PATTERNS.ipv6Address, (match) => this.store(match, 'NETWORK'));
    scrubbed = scrubbed.replace(PII_PATTERNS.macAddress, (match) => this.store(match, 'NETWORK'));
    
    // Financial information
    scrubbed = scrubbed.replace(PII_PATTERNS.ukSortCode, (match) => this.store(match, 'BANK'));
    scrubbed = scrubbed.replace(PII_PATTERNS.ukBankAccount, (match) => this.store(match, 'BANK'));
    scrubbed = scrubbed.replace(PII_PATTERNS.cardNumber, (match) => this.store(match, 'CARD'));
    scrubbed = scrubbed.replace(PII_PATTERNS.iban, (match) => this.store(match, 'BANK'));
    
    // Government-issued identifiers
    scrubbed = scrubbed.replace(PII_PATTERNS.ukDrivingLicense, (match) => this.store(match, 'LICENSE'));
    scrubbed = scrubbed.replace(PII_PATTERNS.ukPassport, (match) => this.store(match, 'PASSPORT'));
    scrubbed = scrubbed.replace(PII_PATTERNS.ukVehicleReg, (match) => this.store(match, 'VEHICLE'));
    scrubbed = scrubbed.replace(PII_PATTERNS.caseId, (match) => this.store(match, 'FIELD'));
    
    // Street addresses
    scrubbed = scrubbed.replace(PII_PATTERNS.streetAddress, (match) => this.store(match, 'ADDRESS'));
    
    // House names
    scrubbed = scrubbed.replace(PII_PATTERNS.houseName, (match) => this.store(match, 'ADDRESS'));
    scrubbed = scrubbed.replace(PII_PATTERNS.partialAddress, (match) => this.store(match, 'ADDRESS'));
    
    // === PHASE 2: Date and age information ===
    
    // Age patterns
    scrubbed = scrubbed.replace(PII_PATTERNS.agePatterns, (match) => this.store(match, 'AGE'));
    
    // Year of birth patterns
    scrubbed = scrubbed.replace(PII_PATTERNS.yearOfBirth, (match) => this.store(match, 'DOB'));
    
    // Long-form dates (before numeric to avoid partial matches)
    scrubbed = scrubbed.replace(PII_PATTERNS.longFormDate, (match) => this.store(match, 'DATE'));
    scrubbed = scrubbed.replace(PII_PATTERNS.shortMonthDate, (match) => this.store(match, 'DATE'));
    scrubbed = scrubbed.replace(PII_PATTERNS.shortMonthNumericDate, (match) => this.store(match, 'DATE'));
    
    // ISO dates
    scrubbed = scrubbed.replace(PII_PATTERNS.isoDate, (match) => this.store(match, 'DATE'));
    
    // Standard date formats
    scrubbed = scrubbed.replace(PII_PATTERNS.dateFormats, (match) => this.store(match, 'DATE'));
    
    // === PHASE 3: Name patterns ===

    // ALL-CAPS name pairs: "JOHN SMITH", "PATRICIA ANNE WALKER" — common in formal UK care documents
    scrubbed = scrubbed.replace(
      /\b([A-Z]{2,})[ \t]+([A-Z]{2,})(?:[ \t]+([A-Z]{2,}))?\b/g,
      (match, first, second, third) => {
        if (NON_NAME_ABBREVIATIONS.has(first) || NON_NAME_ABBREVIATIONS.has(second)) return match;
        if (first.length < 3 || second.length < 3) return match;
        const parts = [first, second];
        if (third) parts.push(third);
        return parts.map((p) => this.store(p, 'NAME')).join(' ');
      }
    );

    // ALL-CAPS single name after a role or context label: "Assessed by PATRICIA"
    scrubbed = scrubbed.replace(
      /\b(assessed by|reviewed by|visited by|completed by|performed by|signed by|attended by|present|carer|worker|nurse|coordinator)\s+([A-Z]{3,})\b/gi,
      (_match, ctx, name) => {
        if (NON_NAME_ABBREVIATIONS.has(name)) return _match;
        return `${ctx} ${this.store(name, 'NAME')}`;
      }
    );

    // Explicit name introductions
    scrubbed = scrubbed.replace(
      /\b(my name is|i am called|i'm called|call me|known as|also known as|a\.k\.a\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
      (match, prefix, name) => `${prefix} ${this.store(name, 'NAME')}`
    );

    // Initials like M.S. or J.D.
    // Trailing \b fails after '.' (non-word char); use lookahead instead
    scrubbed = scrubbed.replace(/\b[A-Z]\.[A-Z]\.(?:[A-Z]\.)?(?=[\s,;:!?"'\n]|$)/g, (match) => this.store(match, 'NAME'));

    // Initials without dots: MS, KB, JD, etc. (2-3 capital letters as standalone)
    // Only if preceded by "initials:" or similar context
    scrubbed = scrubbed.replace(
      /\b(?:initials?|known as|called)\s*:?\s*([A-Z]{2,3})(?:\b|(?=\s|$)|(?=[,;.\n]))/gi,
      (_match, initials) => {
        if (initials.length < 2) return _match;
        return this.store(initials, 'NAME');
      }
    );
    
    // === PHASE 4: Labeled PII fields ===
    scrubbed = scrubbed.replace(/\b([A-Z][a-z]+)'s\b/g, (match, name) => {
      if (isClinicalOrMedicalTerm(name)) return match;
      if (COMMON_ENGLISH_WORDS.has(name.toLowerCase())) return match;
      return `${this.store(name, 'NAME')}'s`;
    });

    // Full name patterns (First Last or First Middle Last) — same line only
    // [ \t]+ prevents spanning newlines (which would incorrectly merge two lines)
    scrubbed = scrubbed.replace(
      /\b([A-Z][a-z]+)[ \t]+((?:O'|Mc|Mac)?[A-Za-z][a-z]+)(?:[ \t]+((?:O'|Mc|Mac)?[A-Za-z][a-z]+))?\b/g,
      (match, first, second, third) => {
        const phrase = match.toLowerCase();
        if (CARE_PHRASE_WHITELIST.has(phrase)) return match;
        if (isClinicalOrMedicalTerm(first) || isClinicalOrMedicalTerm(second)) return match;
        if (third && isClinicalOrMedicalTerm(third)) return match;
        const lowerFirst = first.toLowerCase();
        if (COMMON_ENGLISH_WORDS.has(lowerFirst) || NON_NAME_CAPITALIZED_WORDS.has(lowerFirst)) return match;
        return this.store(match, 'NAME');
      }
    );
    
    // All lowercase names (common in informal documents)
    scrubbed = scrubbed.replace(
      /\b([a-z]{2,})\s+([a-z]{2,})(?:\s+([a-z]{2,}))?\b/g,
      (match, first, second, third) => {
        // Only scrub if it looks like a name (not common phrase)
        const phrase = match.toLowerCase();
        if (CARE_PHRASE_WHITELIST.has(phrase)) return match;
        if (COMMON_ENGLISH_WORDS.has(first) && COMMON_ENGLISH_WORDS.has(second)) return match;
        if (isClinicalOrMedicalTerm(first) || isClinicalOrMedicalTerm(second)) return match;
        if (third && isClinicalOrMedicalTerm(third)) return match;
        
        const basePhrase = `${first} ${second}`;
        if (CARE_PHRASE_WHITELIST.has(basePhrase)) return match;
        // Only trigger when relationship word is the FIRST word — prevents consuming
        // e.g. "and my granddaughter" which would hide the real name that follows
        const contextMatch = /(mother|father|son|daughter|granddaughter|grandson|sister|brother|wife|husband|partner|friend|carer|neighbor|neighbour)/i;
        if (contextMatch.test(first)) {
          return this.store(match, 'NAME');
        }
        
        // Check if preceded by name context
        const precedingContext = /(present at assessment|attended by|with|seen with|accompanied by):/i;
        const beforeMatch = scrubbed.slice(Math.max(0, scrubbed.lastIndexOf(match) - 50), scrubbed.lastIndexOf(match));
        if (precedingContext.test(beforeMatch)) {
          return this.store(match, 'NAME');
        }
        
        // If words are longer and not common, likely names
        if (first.length >= 4 && second.length >= 4 && !COMMON_ENGLISH_WORDS.has(first) && !COMMON_ENGLISH_WORDS.has(second)) {
          return this.store(match, 'NAME');
        }
        
        return match;
      }
    );

    // Single names in relationship or narrative context (e.g., "met kenny", "granddaughter kaylee").
    scrubbed = scrubbed.replace(
      /\b(met|with|named|name is|brought up|mentioned|daughter|son|granddaughter|grandson|wife|husband|partner|friend|carer|coordinator)\s+([A-Za-z][a-z]{2,}(?:\.[A-Za-z][a-z]{2,})?)(?:\s+and\s+([A-Za-z][a-z]{2,}(?:\.[A-Za-z][a-z]{2,})?))?\b/gi,
      (match, ctx, rawName, rawName2) => {
        const lowerName = String(rawName || '').toLowerCase();
        if (!lowerName || COMMON_ENGLISH_WORDS.has(lowerName) || isClinicalOrMedicalTerm(lowerName)) {
          return match;
        }
        const first = this.store(rawName, 'NAME');
        const lowerName2 = String(rawName2 || '').toLowerCase();
        if (!rawName2 || !lowerName2 || COMMON_ENGLISH_WORDS.has(lowerName2) || isClinicalOrMedicalTerm(lowerName2)) {
          return `${ctx} ${first}`;
        }
        return `${ctx} ${first} and ${this.store(rawName2, 'NAME')}`;
      }
    );

    // Explicit locality context in biography sections.
    // [ \t]+ prevents spanning newlines; optional colon for "Born in: Walker" forms.
    scrubbed = scrubbed.replace(
      /\b(grew up in|born in|well known in|lives in|live in|living in|resides in)\s*:?\s*([A-Za-z][a-z]{2,}(?:[ \t]+[A-Za-z][a-z]{2,}){0,2})\b/gi,
      (match, ctx, place) => {
        const lowerPlace = String(place || '').toLowerCase();
        if (!lowerPlace || COMMON_ENGLISH_WORDS.has(lowerPlace)) return match;
        return `${ctx} ${this.store(place, 'LOCATION')}`;
      }
    );
    

    // === PHASE 3.5: Biographical patterns (must precede single-name-in-context) ===

    // Contact-role identifying combinations: "daughter is next of kin and works as GP"
    scrubbed = scrubbed.replace(
      /(?:my\s+)?(?:daughter|son|wife|husband|partner|granddaughter|grandson|sibling|brother|sister|mother|father)\b[^.!?\n]*?\b(?:next of kin|works? as|employed as|is a)\b[^.!?\n]*/gi,
      (m) => this.store(m, 'BIOGRAPHICAL')
    );

    // Family member death: must run before Phase 6 single-name-in-context
    // to prevent "daughter died" splitting into daughter(ctx) + died(name)
    scrubbed = scrubbed.replace(
      /\b(?:daughter|son|wife|husband|partner|granddaughter|grandson|sibling|brother|sister|child|children)\s+(?:died|passed away|death|deceased)\b[^\n.;]*/gi,
      (m) => this.store(m, 'BIOGRAPHICAL')
    );

    // Sensitive biography fragments (married twice, had N children, etc.)
    scrubbed = scrubbed.replace(PII_PATTERNS.sensitiveBiography, (m) => this.store(m, 'BIOGRAPHICAL'));


    // === PHASE 4: Labeled PII fields ===
    
    // DOB with date
    scrubbed = scrubbed.replace(
      /\b(DOB|Date of Birth|D\.O\.B\.?)\s*:?\s*([^\n,;]{1,80})/gi,
      (_match, label, value) => {
        const trimmed = value.trim();
        if (trimmed.includes('{{PII_')) return `${label}: ${trimmed}`;
        return `${label}: ${this.store(trimmed, 'DOB')}`;
      }
    );

    // Additional date labels frequently used in risk and initial assessments.
    scrubbed = scrubbed.replace(
      /\b(Date of initial assessment|Date of service commencement|Service commencement date|Assessment date|Initial assessment date)\s*:?\s*([^\n,;]{1,80})/gi,
      (_match, label, value) => {
        const trimmed = value.trim();
        if (trimmed.includes('{{PII_')) return `${label}: ${trimmed}`;
        return `${label}: ${this.store(trimmed, 'DATE')}`;
      }
    );
    
    // Contact information labels
    scrubbed = scrubbed.replace(
      /\b(Emergency contact|Next of kin|Contact|Tel|Telephone|Phone|Mobile|Email)\s*:?\s*([^\n,;]{1,120})/gi,
      (_match, label, value) => {
        const trimmed = value.trim();
        if (trimmed.includes('{{PII_')) return `${label}: ${trimmed}`;
        const hasEmail = new RegExp(PII_PATTERNS.email).test(trimmed);
        const hasPhone = new RegExp(PII_PATTERNS.ukPhone).test(trimmed) || new RegExp(PII_PATTERNS.intlPhone).test(trimmed);
        if (hasEmail) return `${label}: ${this.store(trimmed, 'EMAIL')}`;
        if (hasPhone) return `${label}: ${this.store(trimmed, 'PHONE')}`;
        return `${label}: ${this.store(trimmed, 'CONTACT')}`;
      }
    );
    
    // Address labels
    scrubbed = scrubbed.replace(
      /\b(Address|Home address|Residence)\s*:?\s*([^\n]{1,160})/gi,
      (_match, label, value) => {
        const trimmed = value.trim();
        if (trimmed.includes('{{PII_')) return `${label}: ${trimmed}`;
        return `${label}: ${this.store(trimmed, 'ADDRESS')}`;
      }
    );

    // Signature and assessor labels (captures dotted usernames like Lewis.Barron).
    scrubbed = scrubbed.replace(
      /\b(Signed by|SignedBy|Assessor|Care Coordinator|Completed by|Performed by)\s*:?\s*([^\n,;]{1,120})/gi,
      (_match, label, value) => {
        const trimmed = value.trim();
        if (trimmed.includes('{{PII_')) return `${label}: ${trimmed}`;
        return `${label}: ${this.store(trimmed, 'STAFF')}`;
      }
    );
    
    // === PHASE 5: Titled names ===
    scrubbed = scrubbed.replace(
      /\b(Mr|Mrs|Ms|Miss|Dr|Prof|Professor)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
      (match, title, name) => {
        const lower = String(title || "").toLowerCase();
        const category: PIICategory = (lower === "dr" || lower === "prof" || lower === "professor") 
          ? 'HEALTHCARE_PRO' 
          : 'NAME';
        return `${title} ${this.store(name, category)}`;
      }
    );
    
    // === PHASE 6: Staff names ===
    scrubbed = scrubbed.replace(
      /\b(Carer|Care Worker|Nurse|Doctor|GP|Support Worker|Key Worker|Social Worker)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
      (match, role, name) => `${role}: ${this.store(name, 'STAFF')}`
    );

    // === PHASE 7: Biographical quasi-identifiers (detected generically) ===
    // Sibling count patterns: "One of 7 siblings", "eldest of 6 children"
    scrubbed = scrubbed.replace(
      /\b(?:one|eldest|youngest|middle|first|last|only|both|all)\s+of\s+(\d+)\s+(?:siblings?|children|kids|young(?:ster)?s|offspring)\b/gi,
      (m) => this.store(m, 'BIOGRAPHICAL')
    );

    // Generational markers paired with occupations or age (not simple "born in <place>")
    // Note: simple "born in <place>" is handled by the locality pattern above (LOCATION token)
    scrubbed = scrubbed.replace(
      /\b(?:born|grew up|raised|brought up|from a young age|childhood|firstborn)\s+(?:in|during|as a|at age)\b[^\n.;]*/gi,
      (m) => {
        // Only store when genuine biographical context (age markers, occupation, death)
        if (/\b(?:age\s*\d{1,3}|\d{1,3}\s*year|occupation|worked\s+as|profession|well\s+known|died)\b/i.test(m)) {
          return this.store(m, 'BIOGRAPHICAL');
        }
        return m;
      }
    );

    // === PHASE 8: Always scrub standalone personal names ===
    scrubbed = scrubbed.replace(
      /\b([A-Z][a-z]{2,}|[A-Z]{2,3})(?:\s+and\s+([A-Z][a-z]{2,}|[A-Z]{2,3}))?\b/g,
      (match, firstName, secondName) => {
        if (!this.shouldAlwaysScrubNameCandidate(firstName)) return match;
        const firstToken = this.store(firstName, 'NAME');
        if (!secondName || !this.shouldAlwaysScrubNameCandidate(secondName)) {
          return firstToken;
        }
        return `${firstToken} and ${this.store(secondName, 'NAME')}`;
      }
    );
    
    return this.narrativeRescuePass(scrubbed);
  }

  /**
   * Scrub any data type (string, array, object)
   */
  scrub(data: any): any {
    if (typeof data === "string") {
      return this.scrubString(data);
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.scrub(item));
    }
    if (typeof data === "object" && data !== null) {
      const scrubbed: Record<string, any> = {};
      for (const key of Object.keys(data)) {
        // Check if key itself suggests PII
        const lowerKey = key.toLowerCase().replace(/[_\s]/g, "");
        if (["name", "fullname", "firstname", "lastname", "surname", "email", "phone", "telephone", "mobile", "address", "postcode", "nhs", "ninumber", "dob", "dateofbirth", "signedby", "assessor", "caseid"].includes(lowerKey)) {
          scrubbed[key] = this.scrubStructuredValue(data[key], 'FIELD');
        } else if (["sexualorientation", "orientation", "medicalconditions", "diagnosis", "condition", "capacity"].includes(lowerKey)) {
          scrubbed[key] = this.scrubStructuredValue(data[key], 'HEALTH');
        } else if (["biography", "lifestory", "familyhistory", "relationshiphistory"].includes(lowerKey)) {
          scrubbed[key] = this.scrubStructuredValue(data[key], 'BIOGRAPHICAL');
        } else if (["location", "placeofbirth", "socialhistorylocation"].includes(lowerKey)) {
          scrubbed[key] = this.scrubStructuredValue(data[key], 'LOCATION');
        } else {
          scrubbed[key] = this.scrub(data[key]);
        }
      }
      return scrubbed;
    }
    return data;
  }
  
  /**
   * Restore tokens in a string back to original values
   */
  restoreString(data: string): string {
    let restored = data;
    
    // Find all tokens and replace with originals
    const escapedPrefix = this.escapeRegex(this.prefix);
    const tokenPattern = new RegExp(`\\{\\{${escapedPrefix}_[A-Z_]+_\\d+\\}\\}`, 'g');
    restored = restored.replace(tokenPattern, (token) => {
      const original = this.get(token);
      return original !== undefined ? original : token;
    });
    
    return restored;
  }
  
  /**
   * Restore any data type (string, array, object)
   */
  restore(data: any): any {
    if (typeof data === "string") {
      return this.restoreString(data);
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.restore(item));
    }
    if (typeof data === "object" && data !== null) {
      const restored: Record<string, any> = {};
      for (const key of Object.keys(data)) {
        restored[key] = this.restore(data[key]);
      }
      return restored;
    }
    return data;
  }
  
  private narrativeRescuePass(text: string): string {
    const merged = this.mergeSpans(this.collectNarrativeSpans(text).filter((span) => span.confidence >= this.thresholds.autoRedact));
    return this.applyNarrativeSpans(text, merged);
  }

  private collectNarrativeSpans(text: string): NarrativeSpan[] {
    const spans: NarrativeSpan[] = [];
    const paragraphs = text.split(/\n{2,}/);
    let cursor = 0;

    for (const paragraph of paragraphs) {
      const offset = cursor;
      cursor += paragraph.length + 2;

      if (!this.shouldInspectNarrativeParagraph(paragraph)) {
        continue;
      }

      this.collectRegexSpans(paragraph, offset, NARRATIVE_NAME_LEAK, 'NAME', 0.73, spans, 'name_context', 1);
      this.collectRegexSpans(paragraph, offset, NARRATIVE_LOCATION_LEAK, 'LOCATION', 0.8, spans, 'location_context', 1);
      this.collectRegexSpans(paragraph, offset, NARRATIVE_BIOGRAPHICAL_CLAUSE, 'BIOGRAPHICAL', 0.82, spans, 'biographical_clause');
      this.collectRegexSpans(paragraph, offset, NARRATIVE_HEALTH_CLAUSE, 'HEALTH', 0.85, spans, 'health_clause');

      if (this.isNearUniqueParagraph(paragraph)) {
        this.collectRegexSpans(paragraph, offset, /\b(?:married|children|died|occupation|well known|born|grew up|lives with me|granddaughter|next of kin)\b[^\n.;]*/gi, 'BIOGRAPHICAL', 0.7, spans, 'near_unique_context');
      }

      this.collectQuasiIdentifierSentenceSpans(paragraph, offset, spans);
    }

    return spans;
  }

  private shouldInspectNarrativeParagraph(paragraph: string): boolean {
    const trimmed = paragraph.trim();
    if (!trimmed) return false;
    if (trimmed.includes('{{PII_')) return true;
    if (/^\s*[\[{]/.test(trimmed) || /^\s*(system|assistant|instruction|json|yaml)\b/i.test(trimmed)) {
      return false;
    }
    return NARRATIVE_PERSON_CONTEXT.test(trimmed);
  }

  private collectRegexSpans(
    paragraph: string,
    paragraphOffset: number,
    regex: RegExp,
    category: PIICategory,
    confidence: number,
    spans: NarrativeSpan[],
    reason: string,
    captureGroup = 0,
  ): void {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(paragraph)) !== null) {
      const raw = captureGroup > 0 ? match[captureGroup] : match[0];
      const localStart = captureGroup > 0
        ? match.index + match[0].indexOf(raw)
        : match.index;
      const localEnd = localStart + raw.length;
      if (localStart < 0 || localEnd <= localStart) {
        continue;
      }
      const candidate = paragraph.slice(localStart, localEnd).trim();
      const sentence = this.extractSentenceContext(paragraph, localStart, localEnd);
      if (this.shouldSkipNarrativeCandidate(candidate, category, sentence)) {
        continue;
      }
      spans.push({
        start: paragraphOffset + localStart,
        end: paragraphOffset + localEnd,
        category,
        confidence,
        reason,
      });
    }
  }

  private collectQuasiIdentifierSentenceSpans(paragraph: string, paragraphOffset: number, spans: NarrativeSpan[]): void {
    const sentenceRegex = /[^.!?\n]+[.!?\n]?/g;
    let sentenceMatch: RegExpExecArray | null;
    while ((sentenceMatch = sentenceRegex.exec(paragraph)) !== null) {
      const sentence = sentenceMatch[0].trim();
      if (!sentence) continue;
      if (!PERSON_LINK_HINT.test(sentence)) continue;
      if (sentence.includes('{{PII_')) continue;

      let score = 0;
      if (/\b(?:daughter|son|wife|husband|partner|family|children|next of kin|granddaughter|grandson)\b/i.test(sentence)) score += 1;
      if (/\b(?:married|divorc(?:ed|e)|widowed|died|bereavement|relationship|first marriage|passed away)\b/i.test(sentence)) score += 1;
      if (/\b(?:age\s+\d{1,3}|born\s+(?:19|20)?\d{2}|\d{1,3}\s+years?\s+old)\b/i.test(sentence)) score += 1;
      if (/\b(?:grew up in|born in|lives in|lived in|well known in|from\s+[a-z]|known throughout)\b/i.test(sentence)) score += 2; // location context scores higher
      if (/\b(?:occupation|worked as|former occupation|well known in the area)\b/i.test(sentence)) score += 1;
      if (/\b(?:one of\s+\d+\s+siblings?|eldest of|youngest of)\b/i.test(sentence)) score += 2; // sibling count is high quasi-identifier
      if (/\b(?:raised|brought up|childhood|youngest|eldest|firstborn)\b/i.test(sentence)) score += 1;

      if (/\b(?:next of kin|daughter|son|wife|husband|partner)\b.{0,60}\b(?:gp|nurse|doctor|social worker|care coordinator)\b/i.test(sentence)) {
        spans.push({
          start: paragraphOffset + sentenceMatch.index,
          end: paragraphOffset + sentenceMatch.index + sentence.length,
          category: 'BIOGRAPHICAL',
          confidence: 0.76,
          reason: 'contact_role_combination',
        });
        continue;
      }

      if (score >= 3) {
        spans.push({
          start: paragraphOffset + sentenceMatch.index,
          end: paragraphOffset + sentenceMatch.index + sentence.length,
          category: 'BIOGRAPHICAL',
          confidence: 0.66,
          reason: 'quasi_identifier_combination',
        });
      }
    }
  }

  private shouldSkipNarrativeCandidate(candidate: string, category: PIICategory, sentenceContext: string): boolean {
    if (!candidate || candidate.length < 3) return true;
    if (candidate.includes('{{PII_')) return true;
    const normalized = candidate.toLowerCase().trim();
    const normalizedSentence = sentenceContext.toLowerCase();

    if (category === 'HEALTH') {
      const hasPersonLink = PERSON_LINK_HINT.test(normalizedSentence) || normalizedSentence.includes('{{pii_');
      if (!hasPersonLink) {
        return true;
      }
      if (GENERIC_HEALTH_GUIDANCE_HINT.test(normalizedSentence) && !PERSON_LINK_HINT.test(normalizedSentence)) {
        return true;
      }
    }

    if (category === 'LOCATION' && GENERIC_LOCATION_WORDS.has(normalized)) {
      return true;
    }
    if (category === 'LOCATION') {
      if (!BIOGRAPHY_LINK_HINT.test(normalizedSentence) && !PERSON_LINK_HINT.test(normalizedSentence)) {
        return true;
      }
    }

    if (category === 'NAME') {
      if (COMMON_ENGLISH_WORDS.has(normalized)) return true;
      if (isClinicalOrMedicalTerm(normalized)) return true;
      if (MEDICATION_WHITELIST.has(normalized)) return true;
    }

    if (category === 'BIOGRAPHICAL' && normalized.length < 8) {
      return true;
    }

    return false;
  }

  private extractSentenceContext(paragraph: string, start: number, end: number): string {
    const leftBoundary = Math.max(
      paragraph.lastIndexOf('.', start - 1),
      paragraph.lastIndexOf('!', start - 1),
      paragraph.lastIndexOf('?', start - 1),
      paragraph.lastIndexOf('\n', start - 1),
    );
    const rightCandidates = [
      paragraph.indexOf('.', end),
      paragraph.indexOf('!', end),
      paragraph.indexOf('?', end),
      paragraph.indexOf('\n', end),
    ].filter((idx) => idx >= 0);
    const rightBoundary = rightCandidates.length > 0 ? Math.min(...rightCandidates) : paragraph.length;
    return paragraph.slice(leftBoundary >= 0 ? leftBoundary + 1 : 0, rightBoundary).trim();
  }

  private scrubStructuredValue(value: unknown, category: PIICategory): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return this.store(value, category);
    if (Array.isArray(value)) return value.map((item) => this.scrubStructuredValue(item, category));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.scrubStructuredValue(v, category);
      }
      return out;
    }
    return this.store(String(value), category);
  }

  private shouldAlwaysScrubNameCandidate(candidate: string): boolean {
    if (!candidate) return false;
    if (candidate.includes('{{PII_')) return false;
    const normalized = candidate.toLowerCase();

    if (COMMON_ENGLISH_WORDS.has(normalized)) return false;
    if (NON_NAME_CAPITALIZED_WORDS.has(normalized)) return false;
    if (isClinicalOrMedicalTerm(normalized)) return false;
    if (MEDICATION_WHITELIST.has(normalized)) return false;
    if (candidate.length <= 3 && NON_NAME_ABBREVIATIONS.has(candidate.toUpperCase())) return false;

    if (/^[A-Z]{2,3}$/.test(candidate)) {
      return !NON_NAME_ABBREVIATIONS.has(candidate);
    }

    return /^[A-Z][a-z]{2,}$/.test(candidate);
  }

  private applyNarrativeSpans(text: string, spans: NarrativeSpan[]): string {
    if (spans.length === 0) {
      return text;
    }
    let result = '';
    let index = 0;
    for (const span of spans) {
      if (span.start < index) {
        continue;
      }
      result += text.slice(index, span.start);
      const original = text.slice(span.start, span.end).trim();
      if (!original || original.includes('{{PII_')) {
        result += text.slice(span.start, span.end);
      } else {
        result += this.store(original, span.category);
      }
      index = span.end;
    }
    result += text.slice(index);
    return result;
  }

  private mergeSpans(spans: NarrativeSpan[]): NarrativeSpan[] {
    if (spans.length === 0) return [];
    const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
    const merged: NarrativeSpan[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = merged[merged.length - 1];
      const next = sorted[i];
      if (next.start <= prev.end + 1) {
        prev.end = Math.max(prev.end, next.end);
        if (next.confidence > prev.confidence) {
          prev.category = next.category;
          prev.confidence = next.confidence;
          prev.reason = next.reason;
        }
        continue;
      }
      merged.push(next);
    }
    return merged;
  }

  private isNearUniqueParagraph(paragraph: string): boolean {
    let score = 0;
    if (/\b(?:children|sons?|daughters?|granddaughter|grandson)\b/i.test(paragraph)) score += 1;
    if (/\b(?:married|divorc(?:ed|e)|widowed|relationship)\b/i.test(paragraph)) score += 1;
    if (/\b(?:died|death|bereavement)\b/i.test(paragraph)) score += 1;
    if (/\b(?:age\s+\d{1,3}|born\s+(?:19|20)\d{2})\b/i.test(paragraph)) score += 1;
    if (/\b(?:known in the area|occupation|worked as|grew up in|born in)\b/i.test(paragraph)) score += 1;
    return score >= 2;
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * Convert tokens to human-readable placeholders (not original values)
   * Returns GDPR-compliant template output with no personal data
   * Example: {{PII_xyz_NAME_1}} → [Name], {{PII_xyz_NHS_NUM_2}} → [NHS Number]
   */
  toPlaceholdersString(data: string): string {
    const escapedPrefix = this.escapeRegex(this.prefix);
    const tokenPattern = new RegExp(`\\{\\{${escapedPrefix}_([A-Z_]+)_\\d+\\}\\}`, 'g');
    return data.replace(tokenPattern, (token, category) => {
      const placeholders: Record<string, string> = {
        'NHS_NUM': '[NHS Number]',
        'NI_NUM': '[NI Number]',
        'POSTCODE': '[Postcode]',
        'EMAIL': '[Email]',
        'PHONE': '[Phone]',
        'DATE': '[Date]',
        'DOB': '[Date of Birth]',
        'AGE': '[Age]',
        'ADDRESS': '[Address]',
        'NAME': '[Name]',
        'STAFF': '[Staff Member]',
        'HEALTHCARE_PRO': '[Healthcare Professional]',
        'CONTACT': '[Contact Number]',
        'FIELD': '[Personal Field]',
        'BANK': '[Bank Details]',
        'CARD': '[Card Number]',
        'LICENSE': '[Driving License]',
        'PASSPORT': '[Passport Number]',
        'VEHICLE': '[Vehicle Registration]',
        'NETWORK': '[Network ID]',
        'LOCATION': '[Location]',
        'BIOGRAPHICAL': '[Biographical Detail]',
        'HEALTH': '[Health Detail]',
        'IP': '[IP Address]',
        'MAC': '[MAC Address]',
      };
      return placeholders[category] || '[Redacted]';
    });
  }
  
  /**
   * Convert any data type to placeholder format (no PII returned)
   * Use this instead of restore() for GDPR-exempt template outputs
   */
  toPlaceholders(data: any): any {
    if (typeof data === "string") {
      return this.toPlaceholdersString(data);
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.toPlaceholders(item));
    }
    if (typeof data === "object" && data !== null) {
      const result: Record<string, any> = {};
      for (const key of Object.keys(data)) {
        result[key] = this.toPlaceholders(data[key]);
      }
      return result;
    }
    return data;
  }
  
  /**
   * Clear all stored entries (for memory management)
   */
  clear(): void {
    this.entries.clear();
    this.reverseMap.clear();
  }
  
  /**
   * Get vault age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.createdAt;
  }
  
  /**
   * Log vault activity for security audit
   * Call this after scrub/restore operations for compliance
   */
  logAudit(operation: 'SCRUB' | 'RESTORE', endpoint: string, userId?: number | string | null, username?: string | null): void {
    const stats = this.getStats();
    logSecurityEvent({
      eventType: operation === 'SCRUB' ? 'PII_SCRUB' : 'PII_RESTORE',
      endpoint,
      userId: typeof userId === 'number' ? userId : null,
      username,
      details: {
        vaultPrefix: this.prefix,
        totalItems: stats.total,
        categories: Object.fromEntries(
          Object.entries(stats.byCategory).filter(([, v]) => v > 0)
        ),
        vaultAgeMs: this.getAge(),
      },
    });
  }
  
  /**
   * Export vault mapping for client-side restoration (authorized users only)
   * Returns a serializable object mapping tokens to { original, category }
   * Security: Only export when explicitly requested by authorized admin users
   */
  export(): { prefix: string; mapping: Record<string, { original: string; category: PIICategory }> } {
    const mapping: Record<string, { original: string; category: PIICategory }> = {};
    for (const [token, entry] of this.entries) {
      mapping[token] = { original: entry.original, category: entry.category };
    }
    return { prefix: this.prefix, mapping };
  }
  
  /**
   * Get the vault prefix for pattern matching
   */
  getPrefix(): string {
    return this.prefix;
  }
  
  /**
   * Verify integrity of vault - check for tampering or corruption
   */
  verifyIntegrity(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check that all entries have matching reverse mappings
    for (const [token, entry] of this.entries) {
      const reverseToken = this.reverseMap.get(entry.original);
      if (reverseToken !== token) {
        issues.push(`Mismatched reverse mapping for token: ${token.substring(0, 20)}...`);
      }
    }
    
    // Check for duplicate originals with different tokens
    const originalCounts = new Map<string, number>();
    for (const entry of this.entries.values()) {
      originalCounts.set(entry.original, (originalCounts.get(entry.original) || 0) + 1);
    }
    for (const [original, count] of originalCounts) {
      if (count > 1) {
        issues.push(`Duplicate original value stored with multiple tokens`);
      }
    }
    
    return { valid: issues.length === 0, issues };
  }
}

/**
 * Create a scoped vault for a single request
 * Automatically clears after the callback completes
 */
async function withPIIVault<T>(
  callback: (vault: PIIVault) => Promise<T>
): Promise<T> {
  const vault = new PIIVault();
  try {
    return await callback(vault);
  } finally {
    vault.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY SCRUBBING (non-reversible, for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

// Clinical terms that look like names but should be preserved
const CLINICAL_WHITELIST = new Set([
  "alzheimer", "parkinson", "huntington", "crohn", "addison", "hodgkin",
  "raynaud", "bartholin", "cushing", "graves", "hashimoto", "meniere",
  "paget", "bell", "down syndrome", "turner syndrome", "klinefelter",
  "marfan", "ehlers danlos", "asperger", "guillain barre", "lou gehrig",
  "wilson disease", "bright disease", "dupuytren", "raynaud's", "bell's",
  "alzheimer's", "parkinson's", "huntington's", "crohn's", "addison's",
  "hodgkin's", "cushing's", "graves'", "hashimoto's", "meniere's", "paget's",
  // Extended clinical conditions common in UK care homes
  "sjogren", "sjogren's", "barrett", "barrett's", "behcet", "behcet's",
  "bowen", "bowen's", "kaposi", "kaposi's", "reiter", "reiter's",
  "tourette", "tourette's", "wegener", "wegener's", "conn", "conn's",
  "fabry", "fabry's", "gaucher", "gaucher's", "kawasaki",
  "ménière", "ménière's", "sjögren", "sjögren's",
  // Assessment/care terminology that may appear as proper nouns
  "waterlow", "barthel", "braden", "norton", "abbey", "malnutrition",
  "must score", "news score", "falls risk", "choking risk",
]);

// Common medication brand names that look like proper nouns
const MEDICATION_WHITELIST = new Set([
  "warfarin", "metformin", "amlodipine", "ramipril", "simvastatin",
  "omeprazole", "levothyroxine", "paracetamol", "codeine", "tramadol",
  "morphine", "fentanyl", "oxycodone", "gabapentin", "pregabalin",
  "sertraline", "fluoxetine", "citalopram", "mirtazapine", "venlafaxine",
  "risperidone", "quetiapine", "olanzapine", "haloperidol", "lorazepam",
  "diazepam", "zopiclone", "insulin", "lantus", "novorapid", "humalog",
  // Extended list for UK care home contexts
  "aspirin", "ibuprofen", "naproxen", "amoxicillin", "cefalexin", "doxycycline",
  "trimethoprim", "nitrofurantoin", "furosemide", "bendroflumethiazide", "bisoprolol",
  "atorvastatin", "apixaban", "rivaroxaban", "clopidogrel", "dalteparin",
  "donepezil", "memantine", "rivastigmine", "galantamine", "levodopa",
  "carbidopa", "ropinirole", "pramipexole", "sinemet", "madopar",
  "salbutamol", "beclometasone", "tiotropium", "budesonide", "montelukast",
  "methotrexate", "hydroxychloroquine", "sulfasalazine", "prednisolone",
  "dexamethasone", "hydrocortisone", "senna", "lactulose", "loperamide",
  "domperidone", "cyclizine", "ondansetron", "co-codamol", "co-dydramol",
  "co-amoxiclav", "flucloxacillin", "clarithromycin", "azithromycin",
  "trazodone", "amitriptyline", "nortriptyline", "duloxetine", "escitalopram",
  "clonazepam", "midazolam", "phenytoin", "carbamazepine", "sodium valproate",
  "levetiracetam", "lamotrigine", "topiramate", "allopurinol", "colchicine",
  "lisinopril", "enalapril", "losartan", "candesartan", "diltiazem", "nifedipine",
  "doxazosin", "tamsulosin", "finasteride", "oxybutynin", "solifenacin",
  "metoclopramide", "ranitidine", "lansoprazole", "esomeprazole", "pantoprazole",
]);

// Common UK place name prefixes/suffixes that indicate addresses
const UK_PLACE_INDICATORS = /\b(road|street|lane|avenue|drive|close|way|court|gardens|grove|place|crescent|terrace|square|hill|park|view|rise|walk|mews|row)\b/i;

// Regex patterns for UK-specific PII
const PII_PATTERNS = {
  // NHS Number: 10 digits, often formatted as 123 456 7890 or 1234567890
  nhsNumber: /\b\d{3}\s?\d{3}\s?\d{4}\b/g,
  
  // National Insurance Number: AB123456C format
  niNumber: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,
  
  // UK Postcode: Full format (SW1A 1AA, EC1A 1BB, etc.)
  ukPostcode: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,
  
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // UK Phone numbers (various formats)
  ukPhone: /\b(?:(?:\+44\s?|0)(?:7\d{3}|\d{2,4}))\s?\d{3,4}\s?\d{3,4}\b/g,
  
  // International phone (generic)
  intlPhone: /\b\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}\b/g,
  
  // Dates in various formats (DD/MM/YYYY, DD-MM-YY, DD.MM.YYYY, etc.)
  dateFormats: /\b(?:0?[1-9]|[12]\d|3[01])[\/.\-](?:0?[1-9]|1[0-2])[\/.\-](?:19|20)?\d{2}\b/g,
  
  // ISO dates (YYYY-MM-DD)
  isoDate: /\b(?:19|20)\d{2}[\-\/](?:0?[1-9]|1[0-2])[\-\/](?:0?[1-9]|[12]\d|3[01])\b/g,
  
  // Age patterns ("aged 85", "85 years old", "85-year-old")
  agePatterns: /\b(?:aged?|age)\s*:?\s*\d{1,3}\b|\b\d{1,3}\s*(?:years?|yrs?)\s*(?:old|of age)\b|\b\d{1,3}-?years?-?old\b/gi,
  
  // Year of birth patterns ("born 1938", "DOB: 1940", "b. 1935")
  yearOfBirth: /\b(?:born|dob|d\.o\.b|b\.)\s*:?\s*(?:19|20)\d{2}\b/gi,
  
  // UK Sort Code: 12-34-56 or 12 34 56
  ukSortCode: /\b\d{2}[\-\s]\d{2}[\-\s]\d{2}\b/g,
  
  // UK Bank Account Number: 8 digits preceded by contextual keywords to avoid false positives
  ukBankAccount: /\b(?:account|acc|a\/c|bank)\s*(?:no|number|num|#|:)?\s*:?\s*\d{8}\b/gi,
  
  // Credit/Debit Card: 13-19 digits (with optional spaces/dashes)
  cardNumber: /\b(?:\d{4}[\s\-]?){3,4}\d{1,4}\b/g,
  
  // UK Driving License: MORGA657054SM9IJ format (complex pattern)
  ukDrivingLicense: /\b[A-Z]{5}\d{6}[A-Z0-9]{5}\b/gi,
  
  // UK Passport Number: 9 digits preceded by contextual keyword
  ukPassport: /\b(?:passport)\s*(?:no|number|num|#|:)?\s*:?\s*\d{9}\b/gi,
  
  // UK Vehicle Registration: AB12 CDE, AB12CDE
  ukVehicleReg: /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/gi,
  
  // Long-form dates: "15 January 2025", "3rd February 2026", "January 15, 2025"
  longFormDate: /\b(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?,?\s*(?:19|20)\d{2}\b/gi,
  
  // Abbreviated long-form dates: "15 Jan 2025", "3rd Feb 2026"
  shortMonthDate: /\b(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(?:19|20)\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?,?\s*(?:19|20)\d{2}\b/gi,

  // Slash or dash month formats: "19/Jul/46", "17-Oct-2022"
  shortMonthNumericDate: /\b(?:0?[1-9]|[12]\d|3[01])[\/.\-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/.\-](?:19|20)?\d{2}\b/gi,
  
  // IBAN (International Bank Account Number)
  iban: /\b[A-Z]{2}\d{2}\s?[A-Z0-9]{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{0,4}\b/gi,
  
  // IP addresses (v4)
  ipAddress: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  
  // IPv6 addresses (simplified pattern)
  ipv6Address: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
  
  // Street addresses (number + street name pattern)
  streetAddress: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Road|Street|Lane|Avenue|Drive|Close|Way|Court|Gardens|Grove|Place|Crescent|Terrace|Square|Hill|Park|View|Rise|Walk|Mews|Row)\b/gi,
  
  // House names with addresses
  houseName: /\b(?:The\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:House|Cottage|Lodge|Bungalow|Flat|Apartment|Villa|Manor)\b/gi,

  // Partial address fragments: "5 michaelgate, byker"
  partialAddress: /\b\d{1,5}\s+[A-Za-z][A-Za-z'`-]{2,}(?:,\s*[A-Za-z][A-Za-z'` -]{2,})\b/g,

  // Case identifiers: "CASE-2-4150"
  caseId: /\b(?:CASE|REF|CLIENT|PATIENT)[-_ ]?\d[\w-]{2,}\b/gi,

  // Sensitive health profile terms often present in assessments
  sensitiveHealthTerms: /\b(?:dementia|type\s*1\s*diabetes|type\s*2\s*diabetes|insulin-?dependent|asthma|arthritis|vertigo|depression|incontinence)\b/gi,

  // Sexual orientation and similar highly sensitive profile terms
  sexualOrientation: /\b(?:heterosexual|straight|gay|lesbian|bisexual|asexual|pansexual|queer)\b/gi,

  // Biographical narrative fragments containing sensitive life-story details
  sensitiveBiography: /\b(?:married\s+twice|first\s+marriage\s+at\s+age\s+\d{1,3}|had\s+\d+\s+children|one\s+of\s+whom\s+died\s+at\s+age\s+\d{1,3}|divorce\s+referenced|former\s+occupation[^\n.,;]*)\b/gi,
  
  // MAC addresses (network device identifiers)
  macAddress: /\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,

  // Initials without dots: MS, KB, JD, etc. (2-3 consecutive capital letters)
  initialsNoDots: /\b[A-Z]{2,3}(?:\b|(?=\s|$)|(?=,|;))/g,

  // Family relationship death patterns: "daughter died at age 27", "son died at 15", etc
  familyMemberDeath: /\b(?:daughter|son|wife|husband|partner|granddaughter|grandson|sibling|brother|sister|child|children)\s+(?:died|passed away|death|deceased|age)\b[^\n.;]*/gi,

  // Sibling count patterns: "One of 7 siblings", "eldest of 6 children"
  siblingCount: /\b(?:one|eldest|youngest|middle|first|last|only|both|all)\s+of\s+(\d+)\s+(?:siblings?|children|kids|young(?:ster)?s|offspring)\b/gi,

  // Relationship to location patterns: "well known in North Shields", "known locally in Walker"
  personLocationContext: /\b(?:well\s+known\s+in|known\s+(?:well\s+)?(?:in|throughout|around|locally\s+in))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,

  // Implicit age/generation markers in narrative
  generationalMarkers: /\b(?:born|grew up|raised|brought up|from a young age|childhood|youngest|eldest|firstborn)\s+(?:in|during|as a|at age)\b[^\n.;]*/gi,
};

// Scrub statistics for logging (optional audit trail)
interface ScrubStats {
  nhsNumbers: number;
  niNumbers: number;
  postcodes: number;
  emails: number;
  phones: number;
  dates: number;
  ages: number;
  addresses: number;
  names: number;
  other: number;
}

function createScrubStats(): ScrubStats {
  return { nhsNumbers: 0, niNumbers: 0, postcodes: 0, emails: 0, phones: 0, dates: 0, ages: 0, addresses: 0, names: 0, other: 0 };
}

function isClinicalOrMedicalTerm(phrase: string): boolean {
  const lower = phrase.toLowerCase().replace(/['']/g, "'");
  return CLINICAL_WHITELIST.has(lower) || MEDICATION_WHITELIST.has(lower);
}

// Enhanced care-domain whitelist for multi-word phrases
const CARE_PHRASE_WHITELIST = new Set([
  "care plan", "care worker", "care home", "care needs", "care staff", "care team",
  "care manager", "care coordinator", "care provider", "care assistant", "care support",
  "risk assessment", "personal care", "mental health", "social worker", "social care",
  "general practitioner", "district nurse", "health visitor", "service user",
  "family member", "next of kin", "emergency contact", "key worker",
  "falls prevention", "fire safety", "skin integrity", "medication administration",
  "infection control", "environmental safety", "lone working", "behavior support",
  "communication support", "dementia care", "end of life", "epilepsy management",
  "diabetes management", "nutrition assessment", "continence care", "mobility assessment",
  "moving and handling", "safeguarding adults", "safeguarding children", "coshh assessment",
  "manual handling", "pressure areas", "tissue viability", "wound care",
  "initial assessment", "care planning", "daily living", "personal hygiene", "oral care",
  "food preparation", "medication support", "emotional support", "social activities",
  "blood pressure", "heart rate", "respiratory rate", "oxygen saturation",
  "body temperature", "weight management", "pain management", "symptom control",
  "palliative care", "health and safety", "dignity and respect", "person centred",
  "person centered", "best practice", "quality assurance", "clinical governance",
  "duty of care", "capacity assessment", "mental capacity", "best interests",
  "deprivation of liberty", "advance directive", "lasting power", "power of attorney",
  "family history", "family background", "personal history",
  "reduced capacity", "mental capacity", "lacks capacity", "has capacity",
  "hospital discharge", "community nurse", "practice nurse", "occupational therapy",
  "speech therapy", "physical therapy", "blood glucose", "blood sugar",
  "fluid intake", "food intake", "bowel movement", "urinary output",
  "vital signs", "medication review", "medication round", "controlled drug",
  "medication error", "adverse reaction", "allergic reaction", "side effect",
]);

// Validate if word looks like a proper name (not a common word)
const COMMON_ENGLISH_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her",
  "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its",
  "may", "new", "now", "old", "see", "way", "who", "boy", "did", "own", "say",
  "she", "too", "use", "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
  "morning", "afternoon", "evening", "night", "daily", "weekly", "monthly",
  "this", "that", "with", "have", "from", "they", "been", "will", "more",
  "when", "some", "what", "there", "which", "their", "about", "would", "make",
  "like", "time", "just", "know", "take", "people", "into", "year", "your",
  "good", "could", "them", "other", "than", "then", "look", "only", "come",
  "over", "such", "also", "back", "after", "work", "first", "well", "even",
  "want", "because", "these", "give", "most", "care", "health", "support",
  "need", "needs", "help", "ensure", "provide", "assist", "monitor",
  "check", "review", "assess", "plan", "record", "document", "report",
  // Common verbs and function words that are NOT personal names
  "died", "passed", "works", "worked", "manages", "managed", "visited",
  "called", "moved", "came", "went", "lives", "lived", "require", "requires",
  "often", "later", "sometimes", "usually", "always", "never", "both",
  "each", "every", "many", "much", "very", "quite", "rather", "still",
  "once", "twice", "again", "though", "while", "since", "either", "whether",
  // Generic geography/place words that should never be NAMEs
  "nearby", "town", "area", "place", "local", "region", "centre", "center",
  "north", "south", "east", "west", "central", "upper", "lower", "inner", "outer",
  // Care domain words that should never be treated as names
  "reduced", "capacity", "continence", "dementia", "mobility", "nutrition",
  "diabetes", "catheter", "stoma", "incontinence", "hygiene", "dignity",
]);

const NON_NAME_ABBREVIATIONS = new Set([
  "DOB", "NHS", "NI", "GP", "API", "JSON", "YAML", "PDF", "EMAR", "CQC", "UK", "ID", "IDs",
]);

const NON_NAME_CAPITALIZED_WORDS = new Set([
  "service", "user", "client", "resident", "patient", "care", "worker", "nurse", "doctor", "support",
  "key", "social", "general", "policy", "guidance", "assessment", "plan", "risk", "date", "address",
  "contact", "phone", "email", "mobile", "dob", "born", "lives", "well", "known", "gender", "initials",
  "case", "id", "notes", "summary", "medication", "history", "family", "partner", "daughter", "son",
  "raised", "street", "road", "lane", "avenue", "town", "city", "county", "north", "south", "east", "west",
  // Common sentence-start words that are not names
  "generic", "later", "both", "often", "sometimes", "usually", "always", "never",
  "she", "he", "his", "her", "they", "their", "this", "that", "these", "those",
  "then", "when", "where", "which", "while", "though", "although", "however",
  "therefore", "further", "moreover", "each", "every", "either", "neither",
  "local", "other", "another", "similar", "above", "below",
]);

const GENERIC_LOCATION_WORDS = new Set([
  'street', 'road', 'lane', 'avenue', 'close', 'way', 'court', 'drive',
  'area', 'region', 'town', 'city', 'village', 'county', 'district',
  'north', 'south', 'east', 'west', 'centre', 'center', 'local',
]);

const NARRATIVE_PERSON_CONTEXT = /\b(?:my|i|me|mine|our|family|granddaughter|grandson|daughter|son|wife|husband|partner|next of kin|gp|service user|resident|client|she|he|lives with me|raised|brought up)\b/i;
const NARRATIVE_NAME_LEAK = /\b(?:met|with|named|called|mentioned|name is|daughter|son|granddaughter|grandson|wife|husband|partner|friend|carer|next of kin|gp|raised|brought up)\s+([A-Za-z][A-Za-z'`.-]{2,}(?:\s+[A-Za-z][A-Za-z'`.-]{2,}){0,2})\b/gi;
const NARRATIVE_LOCATION_LEAK = /\b(?:born in|grew up in|raised in|lives in|lived in|well known in|known in the area|from|moved to|resides in|address(?: is)?|street(?: is)?|known throughout|locally in)\s+([A-Za-z][A-Za-z'` -]{2,}(?:\s+[A-Za-z][A-Za-z'` -]{2,}){0,4})\b/gi;
const NARRATIVE_BIOGRAPHICAL_CLAUSE = /\b(?:married(?:\s+twice|\s+once|\s+\d+\s+times)?|widowed|divorc(?:ed|e)|children|sons?|daughters?|bereavement|died|death|first marriage|relationship history|occupation|worked as|well known in the area|grew up in|born in|age\s+\d{1,3}|one of\s+\d+\s+siblings|eldest|youngest|only child|raised|brought up)\b[^\n.;]*/gi;
const NARRATIVE_HEALTH_CLAUSE = /\b(?:diagnos(?:is|ed)|capacity|lacks capacity|has capacity|dementia|diabetes|insulin(?:-dependent)?|continence|incontinence|pads?|falls?|memory impairment|requires assistance with|needs support with|care needs|catheter|stoma|sexual orientation|heterosexual|straight|gay|lesbian|bisexual)\b[^\n.;]*/gi;
const BIOGRAPHY_LINK_HINT = /\b(?:born|grew up|lived|lives|resides|known in the area|family|married|children|widowed|divorc(?:ed|e)|next of kin|service user|resident|client)\b/i;
const PERSON_LINK_HINT = /\b(?:i|my|me|service user|resident|client|she|he|daughter|son|granddaughter|grandson|wife|husband|partner|next of kin)\b/i;
const GENERIC_HEALTH_GUIDANCE_HINT = /\b(?:monitor|review|guidance|policy|protocol|standard|procedure|best practice)\b/i;

interface NarrativeSpan {
  start: number;
  end: number;
  category: PIICategory;
  confidence: number;
  reason: string;
}

type ScrubProfile = 'strict' | 'balanced' | 'conservative';

interface PIIVaultOptions {
  profile?: ScrubProfile;
}

interface NarrativeThresholds {
  autoRedact: number;
}

function looksLikeProperName(word: string): boolean {
  if (!word || word.length < 2) return false;
  // Title-case names, surname prefixes, or short initials-like tokens.
  if (
    !/^[A-Z][a-z]{2,}(?:['-][A-Z]?[a-z]+)*$/.test(word) &&
    !/^(?:O'|Mc|Mac)[A-Z][a-z]+$/.test(word) &&
    !/^[A-Z]{2,3}$/.test(word)
  ) {
    return false;
  }
  // Not a common word or clinical term
  const lower = word.toLowerCase();
  if (COMMON_ENGLISH_WORDS.has(lower)) return false;
  if (NON_NAME_CAPITALIZED_WORDS.has(lower)) return false;
  if (isClinicalOrMedicalTerm(word)) return false;
  if (MEDICATION_WHITELIST.has(lower)) return false;
  if (word.length <= 3 && NON_NAME_ABBREVIATIONS.has(word.toUpperCase())) return false;
  return true;
}

/**
 * Primary PII scrubbing function - UK GDPR compliant
 * Removes or redacts all identifiable information before AI processing
 * @param data - Input data (string, array, or object)
 * @param stats - Optional stats object to track what was scrubbed
 * @returns Scrubbed data with PII replaced by generic tokens
 */
function scrubPII(data: any, stats?: ScrubStats): any {
  if (typeof data === "string") {
    let scrubbed = data;
    const s = stats || createScrubStats();

    // === PHASE 1: High-confidence PII patterns (regex-based) ===
    
    // NHS Numbers (10 digits, spaced or not)
    scrubbed = scrubbed.replace(PII_PATTERNS.nhsNumber, () => { s.nhsNumbers++; return "[NHS_NUMBER_REDACTED]"; });
    
    // National Insurance Numbers
    scrubbed = scrubbed.replace(PII_PATTERNS.niNumber, () => { s.niNumbers++; return "[NI_NUMBER_REDACTED]"; });
    
    // UK Postcodes
    scrubbed = scrubbed.replace(PII_PATTERNS.ukPostcode, () => { s.postcodes++; return "[POSTCODE_REDACTED]"; });
    
    // Email addresses
    scrubbed = scrubbed.replace(PII_PATTERNS.email, () => { s.emails++; return "[EMAIL_REDACTED]"; });
    
    // Phone numbers (UK and international)
    scrubbed = scrubbed.replace(PII_PATTERNS.ukPhone, () => { s.phones++; return "[PHONE_REDACTED]"; });
    scrubbed = scrubbed.replace(PII_PATTERNS.intlPhone, () => { s.phones++; return "[PHONE_REDACTED]"; });
    
    // IP addresses
    scrubbed = scrubbed.replace(PII_PATTERNS.ipAddress, () => { s.other++; return "[IP_REDACTED]"; });
    
    // Street addresses
    scrubbed = scrubbed.replace(PII_PATTERNS.streetAddress, () => { s.addresses++; return "[ADDRESS_REDACTED]"; });
    
    // House names
    scrubbed = scrubbed.replace(PII_PATTERNS.houseName, () => { s.addresses++; return "[ADDRESS_REDACTED]"; });
    scrubbed = scrubbed.replace(PII_PATTERNS.partialAddress, () => { s.addresses++; return "[ADDRESS_REDACTED]"; });
    scrubbed = scrubbed.replace(PII_PATTERNS.caseId, () => { s.other++; return "[FIELD_REDACTED]"; });
    scrubbed = scrubbed.replace(PII_PATTERNS.sensitiveHealthTerms, () => { s.other++; return "[FIELD_REDACTED]"; });
    scrubbed = scrubbed.replace(PII_PATTERNS.sexualOrientation, () => { s.other++; return "[FIELD_REDACTED]"; });
    scrubbed = scrubbed.replace(PII_PATTERNS.sensitiveBiography, () => { s.other++; return "[FIELD_REDACTED]"; });

    // === PHASE 2: Date and age information ===
    
    // Age patterns ("aged 85", "85 years old")
    scrubbed = scrubbed.replace(PII_PATTERNS.agePatterns, () => { s.ages++; return "[AGE_REDACTED]"; });
    
    // Year of birth patterns
    scrubbed = scrubbed.replace(PII_PATTERNS.yearOfBirth, () => { s.ages++; return "[DOB_REDACTED]"; });
    
    // ISO dates
    scrubbed = scrubbed.replace(PII_PATTERNS.isoDate, () => { s.dates++; return "[DATE_REDACTED]"; });
    
    // Standard date formats
    scrubbed = scrubbed.replace(PII_PATTERNS.dateFormats, () => { s.dates++; return "[DATE_REDACTED]"; });
    scrubbed = scrubbed.replace(PII_PATTERNS.shortMonthDate, () => { s.dates++; return "[DATE_REDACTED]"; });
    scrubbed = scrubbed.replace(PII_PATTERNS.shortMonthNumericDate, () => { s.dates++; return "[DATE_REDACTED]"; });

    // === PHASE 3: Name patterns ===

    // ALL-CAPS name pairs: "JOHN SMITH" — common in formal UK care documents
    scrubbed = scrubbed.replace(
      /\b([A-Z]{2,})[ \t]+([A-Z]{2,})(?:[ \t]+([A-Z]{2,}))?\b/g,
      (match, first, second) => {
        if (NON_NAME_ABBREVIATIONS.has(first) || NON_NAME_ABBREVIATIONS.has(second)) return match;
        if (first.length < 3 || second.length < 3) return match;
        s.names += 2;
        return "[SERVICE_USER]";
      }
    );

    // ALL-CAPS single name after a role or context label
    scrubbed = scrubbed.replace(
      /\b(assessed by|reviewed by|visited by|completed by|performed by|signed by|attended by|carer|worker|nurse|coordinator)\s+([A-Z]{3,})\b/gi,
      (_match, ctx) => { s.names++; return `${ctx} [SERVICE_USER]`; }
    );
    
    // Explicit name introductions
    scrubbed = scrubbed.replace(
      /\b(my name is|i am called|i'm called|call me|known as|also known as|a\.k\.a\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi,
      (match, prefix) => { s.names++; return `${prefix} [SERVICE_USER]`; }
    );

    // Initials like M.S. or J.D.
    scrubbed = scrubbed.replace(/\b[A-Z]\.[A-Z]\.(?:[A-Z]\.)?(?=[\s,;:!?"'\n]|$)/g, () => { s.names++; return "[SERVICE_USER]"; });
    
    // Possessive patterns not in whitelist
    scrubbed = scrubbed.replace(/\b([A-Z][a-z]+)['']s\b/g, (match, name) => {
      if (isClinicalOrMedicalTerm(name)) return match;
      if (COMMON_ENGLISH_WORDS.has(name.toLowerCase())) return match;
      s.names++;
      return "[SERVICE_USER]'s";
    });

    // Full name patterns (First Last or First Middle Last)
    scrubbed = scrubbed.replace(
      /\b([A-Z][a-z]+)\s+((?:O['']|Mc|Mac)?[A-Z][a-z]+)(?:\s+((?:O['']|Mc|Mac)?[A-Z][a-z]+))?\b/g,
      (match, first, second, third) => {
        const phrase = match.toLowerCase();
        // Check if this is a whitelisted care phrase
        if (CARE_PHRASE_WHITELIST.has(phrase)) return match;
        // Check if any part is clinical/medical
        if (isClinicalOrMedicalTerm(first) || isClinicalOrMedicalTerm(second)) return match;
        if (third && isClinicalOrMedicalTerm(third)) return match;
        // Check if first word is common (not a name)
        if (COMMON_ENGLISH_WORDS.has(first.toLowerCase())) return match;
        // Looks like a proper name - redact
        s.names++;
        return "[SERVICE_USER]";
      }
    );


    // === PHASE 3.5: Biographical patterns (before single-name-in-context) ===

    // Contact-role identifying combinations: "daughter is next of kin and works as GP"
    scrubbed = scrubbed.replace(
      /(?:my\s+)?(?:daughter|son|wife|husband|partner|granddaughter|grandson|sibling|brother|sister|mother|father)\b[^.!?\n]*?\b(?:next of kin|works? as|employed as|is a)\b[^.!?\n]*/gi,
      () => { s.other++; return "[BIOGRAPHICAL_REDACTED]"; }
    );

    // Family member death patterns
    scrubbed = scrubbed.replace(
      /\b(?:daughter|son|wife|husband|partner|granddaughter|grandson|sibling|brother|sister|child|children)\s+(?:died|passed away|death|deceased)\b[^\n.;]*/gi,
      () => { s.other++; return "[BIOGRAPHICAL_REDACTED]"; }
    );

    // Sensitive biography fragments (married twice, had N children, etc.)
    scrubbed = scrubbed.replace(PII_PATTERNS.sensitiveBiography, () => { s.other++; return "[FIELD_REDACTED]"; });

    // === PHASE 4: Labeled PII fields ===
    
    // DOB with date
    scrubbed = scrubbed.replace(
      /\b(DOB|Date of Birth|D\.O\.B\.?)\s*:?\s*[^\n,;]{1,20}/gi,
      () => { s.dates++; return "DOB: [DATE_REDACTED]"; }
    );
    
    // Contact information labels
    scrubbed = scrubbed.replace(
      /\b(Emergency contact|Next of kin|Contact|Tel|Telephone|Phone|Mobile|Email)\s*:?\s*[^\n,;]{1,50}/gi,
      (match, label) => { s.other++; return `${label}: [CONTACT_REDACTED]`; }
    );
    
    // Address labels
    scrubbed = scrubbed.replace(
      /\b(Address|Home address|Residence)\s*:?\s*[^\n]{1,100}/gi,
      (match, label) => { s.addresses++; return `${label}: [ADDRESS_REDACTED]`; }
    );

    // === PHASE 5: Titled names (Dr., Mr., Mrs., etc.) ===
    scrubbed = scrubbed.replace(
      /\b(Mr|Mrs|Ms|Miss|Dr|Prof|Professor)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g,
      (match, title) => {
        s.names++;
        const lower = String(title || "").toLowerCase();
        if (lower === "dr" || lower === "prof" || lower === "professor") return "[HEALTHCARE_PROFESSIONAL]";
        return "[PERSON_REDACTED]";
      }
    );

    // === PHASE 6: Clean up any remaining lone proper names at start of labeled fields ===
    scrubbed = scrubbed.replace(
      /\b(Carer|Care Worker|Nurse|Doctor|GP|Support Worker|Key Worker|Social Worker)\s*:?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gi,
      (match, role) => { s.names++; return `${role}: [STAFF_REDACTED]`; }
    );

    // Single names in relationship or narrative context (e.g., "met kenny and natalie").
    scrubbed = scrubbed.replace(
      /\b(met|with|named|name is|brought up|mentioned|daughter|son|granddaughter|grandson|wife|husband|partner|friend|carer|coordinator)\s+([A-Za-z][a-z]{2,})(?:\s+and\s+([A-Za-z][a-z]{2,}))?\b/gi,
      (_m, ctx, firstName, secondName) => {
        s.names++;
        if (secondName) {
          s.names++;
          return `${ctx} [SERVICE_USER] and [SERVICE_USER]`;
        }
        return `${ctx} [SERVICE_USER]`;
      }
    );

    // Explicit locality context in biography sections (e.g., "grew up in walker").
    scrubbed = scrubbed.replace(
      /\b(grew up in|born in|well known in|lives in|live in|living in|resides in)\s*:?\s*[A-Za-z][a-z]{2,}(?:[ \t]+[A-Za-z][a-z]{2,}){0,2}\b/gi,
      (_m, ctx) => {
        s.addresses++;
        return `${ctx} [ADDRESS_REDACTED]`;
      }
    );

    // === PHASE 7: Final standalone name sweep ===
    // Enforce that names are always redacted, even without explicit relationship/service-user context.
    scrubbed = scrubbed.replace(
      /\b([A-Z][a-z]{2,}(?:['-][A-Z]?[a-z]+)*|[A-Z]{2,3})(?:\s+and\s+([A-Z][a-z]{2,}(?:['-][A-Z]?[a-z]+)*|[A-Z]{2,3}))?\b/g,
      (match, firstName, secondName) => {
        if (!looksLikeProperName(firstName)) return match;

        s.names++;
        if (secondName && looksLikeProperName(secondName)) {
          s.names++;
          return "[PERSON_REDACTED] and [PERSON_REDACTED]";
        }
        return "[PERSON_REDACTED]";
      }
    );

    return scrubbed;
  }

  // Recursively handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => scrubPII(item, stats));
  }
  
  // Recursively handle objects
  if (typeof data === "object" && data !== null) {
    const scrubbed: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      // Also check if key itself suggests PII
      const lowerKey = key.toLowerCase();
      if (["name", "fullname", "firstname", "lastname", "surname", "email", "phone", "telephone", "mobile", "address", "postcode", "nhs", "ni_number", "dob", "dateofbirth", "signedby", "assessor", "caseid", "sexualorientation", "orientation", "medicalconditions", "diagnosis", "condition", "biography", "lifestory", "location"].includes(lowerKey.replace(/[_\s]/g, ""))) {
        scrubbed[key] = "[FIELD_REDACTED]";
        if (stats) stats.other++;
      } else {
        scrubbed[key] = scrubPII(data[key], stats);
      }
    }
    return scrubbed;
  }
  
  return data;
}

/**
 * Scrub PII with audit logging - returns both scrubbed data and statistics
 * Use this for compliance auditing and debugging
 */
function scrubPIIWithAudit(data: any): { scrubbed: any; stats: ScrubStats } {
  const stats = createScrubStats();
  const scrubbed = scrubPII(data, stats);
  return { scrubbed, stats };
}

const toFirstPerson = (text: string): string => {
  if (!text) return text;
  let updated = text;
  updated = updated.replace(/\b(the|this)\s+(service user|client|resident|patient)\b/gi, "I");
  updated = updated.replace(/\bthe service user's\b/gi, "my");
  updated = updated.replace(/\bthe client's\b/gi, "my");
  updated = updated.replace(/\bthe resident's\b/gi, "my");
  updated = updated.replace(/\bthe patient's\b/gi, "my");
  return updated;
};

/**
 * Enhanced narrative text sanitizer - UK GDPR compliant
 * Converts scrubbed tokens to natural language for care plan output
 * This runs AFTER scrubPII to make the text more readable
 */
const sanitizeNarrativeText = (text: string): string => {
  if (!text) return text;
  let cleaned = text;

  // Convert redaction tokens to natural language
  cleaned = cleaned.replace(/\[SERVICE_USER\]/gi, "I");
  cleaned = cleaned.replace(/\[SERVICE_USER\]'s/gi, "my");
  cleaned = cleaned.replace(/\[PERSON_REDACTED\]/gi, "someone");
  cleaned = cleaned.replace(/\[HEALTHCARE_PROFESSIONAL\]/gi, "my healthcare professional");
  cleaned = cleaned.replace(/\[STAFF_REDACTED\]/gi, "staff member");
  cleaned = cleaned.replace(/\[DATE_REDACTED\]/gi, "on file");
  cleaned = cleaned.replace(/\[DOB_REDACTED\]/gi, "DOB on file");
  cleaned = cleaned.replace(/\[AGE_REDACTED\]/gi, "age on file");
  cleaned = cleaned.replace(/\[NHS_NUMBER_REDACTED\]/gi, "NHS number on file");
  cleaned = cleaned.replace(/\[NI_NUMBER_REDACTED\]/gi, "NI number on file");
  cleaned = cleaned.replace(/\[POSTCODE_REDACTED\]/gi, "postcode on file");
  cleaned = cleaned.replace(/\[ADDRESS_REDACTED\]/gi, "address on file");
  cleaned = cleaned.replace(/\[EMAIL_REDACTED\]/gi, "email on file");
  cleaned = cleaned.replace(/\[PHONE_REDACTED\]/gi, "phone on file");
  cleaned = cleaned.replace(/\[CONTACT_REDACTED\]/gi, "contact details on file");
  cleaned = cleaned.replace(/\[FIELD_REDACTED\]/gi, "on file");
  cleaned = cleaned.replace(/\[IP_REDACTED\]/gi, "");
  
  // Legacy token conversions (for backward compatibility)
  cleaned = cleaned.replace(/\[(service user)\]/gi, "I");
  cleaned = cleaned.replace(/\[(redacted)\]/gi, "on file");

  // Clean up any labeled fields that might have partial info
  cleaned = cleaned.replace(/\b(DOB|Date of birth)\s*:?\s*on file/gi, "DOB on file");
  cleaned = cleaned.replace(/\b(Address|Home address)\s*:?\s*on file/gi, "address on file");

  // Convert remaining titled names to natural language
  cleaned = cleaned.replace(
    /\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+\[?[A-Z][a-z]+\]?(?:\s+[A-Z][a-z]+){0,2}\b/g,
    (match, title) => {
      const lower = String(title || "").toLowerCase();
      if (lower === "dr") return "my doctor";
      return "someone";
    }
  );

  // Clean up family member name references
  cleaned = cleaned.replace(
    /\b(my)\s+(mother|father|son|daughter|husband|wife|partner|brother|sister|family member|next of kin|friend)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/gi,
    (_match, prefix, relation) => `${prefix} ${relation}`
  );

  // Clean up staff name references
  cleaned = cleaned.replace(
    /\b(care worker|carer|support worker|nurse|doctor|gp|social worker|physio|ot|therapist|care manager|care coordinator)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/gi,
    (_match, role) => role
  );

  // Remove any double spaces or awkward formatting from redactions
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  cleaned = cleaned.replace(/\s+([.,;:])/g, "$1");

  return cleaned.trim();
};

/**
 * Full PII scrubbing pipeline for documents sent to AI
 * First applies comprehensive scrubPII, then sanitizeNarrativeText for readable output
 */
const sanitizeNarrativePII = (data: any): any => {
  if (typeof data === "string") {
    // Step 1: Comprehensive PII scrubbing (UK GDPR compliant)
    const scrubbed = scrubPII(data);
    // Step 2: Convert redaction tokens to natural language
    return sanitizeNarrativeText(scrubbed);
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeNarrativePII(item));
  }
  if (typeof data === "object" && data !== null) {
    const scrubbed: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      scrubbed[key] = sanitizeNarrativePII(data[key]);
    }
    return scrubbed;
  }
  return data;
};

/**
 * Full PII scrubbing with audit trail - use for compliance logging
 */
const sanitizeNarrativePIIWithAudit = (data: any): { result: any; stats: ScrubStats } => {
  const stats = createScrubStats();
  
  const processItem = (item: any): any => {
    if (typeof item === "string") {
      const scrubbed = scrubPII(item, stats);
      return sanitizeNarrativeText(scrubbed);
    }
    if (Array.isArray(item)) {
      return item.map((x) => processItem(x));
    }
    if (typeof item === "object" && item !== null) {
      const result: Record<string, any> = {};
      for (const key of Object.keys(item)) {
        result[key] = processItem(item[key]);
      }
      return result;
    }
    return item;
  };
  
  return { result: processItem(data), stats };
};

// Validate and normalize service user initials
function normalizeInitials(name: string | undefined | null): string {
  if (!name) return 'N.N.';
  const trimmed = name.trim();
  if (!trimmed) return 'N.N.';
  if (/^\{\{PII_[a-z0-9]+_[A-Z_]+_\d+\}\}$/i.test(trimmed)) {
    return trimmed;
  }
  const upper = trimmed.toUpperCase();

  // Check if already in initials format (X.X. or X.X)
  if (/^[A-Z]\.[A-Z]\.?$/.test(upper)) {
    return upper.endsWith('.') ? upper : upper + '.';
  }

  // Compact initials like "FO" or "FON"
  if (/^[A-Z]{2,3}$/.test(upper)) {
    return upper.split("").map(ch => `${ch}.`).join("");
  }

  // Single-letter initial fallback
  if (/^[A-Z]\.?$/.test(upper)) {
    return `${upper[0]}.N.`;
  }

  // If it looks like a full name (multiple words or longer than 4 chars), extract initials
  if (trimmed.includes(' ') || trimmed.length > 4) {
    const parts = trimmed.split(/[\s.]+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      return parts[0][0].toUpperCase() + '.' + parts[parts.length - 1][0].toUpperCase() + '.';
    }
    if (parts.length === 1) {
      return parts[0][0].toUpperCase() + '.N.';
    }
  }

  return 'N.N.';
}

function normalizeFullName(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/information not found/i.test(trimmed)) return "";
  // Reject placeholder/generic words that are not real names
  const lower = trimmed.toLowerCase().replace(/\s+/g, " ");
  const invalidNames = [
    "name", "name name", "full name", "first name", "last name", "surname",
    "unknown", "n/a", "n.a.", "tbc", "tbd", "not specified", "not provided",
    "service user", "client", "resident", "patient", "person",
    "enter name", "your name", "client name", "service user name",
  ];
  if (invalidNames.includes(lower)) return "";
  // Also reject if every word in the name is the same generic word (e.g., "Name Name Name")
  const words = lower.split(" ");
  if (words.length > 0 && words.every(w => w === "name" || w === "unknown" || w === "n/a")) return "";
  return trimmed;
}

function formatRiskAssessmentDate(value?: Date): string {
  const date = value ?? new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return formatter.format(date).replace(/ /g, "/");
}

function normalizeSignedByName(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

const extractServiceUserFullName = (text: string): string => {
  if (!text) return "";
  const stopPattern = /\b(?:allerg(?:y|ies)|allergy status|dob|date of birth|nhs|case id)\b/i;
  const patterns = [
    /Printed date\s+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)\s+CASE/i,
    /\bCase\s*:\s*([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)\b/i,
    /\bCase\s+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)\b/i,
    /Service User(?: Name)?[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
    /Resident(?: Name)?[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
    /Patient(?: Name)?[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
    /Client(?: Name)?[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
    /Name[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let fullName = match[1].replace(/\s+/g, " ").trim();
      fullName = fullName.split(/\s{2,}|\s{1}(?=Allerg(?:y|ies)|Allergy Status|DOB|Date of Birth|NHS|Case ID)/i)[0].trim();
      if (stopPattern.test(fullName)) continue;
      if (/\bcase\s*id\b/i.test(fullName)) continue;
      // Reject generic/placeholder words extracted as names
      const lowerName = fullName.toLowerCase().replace(/\s+/g, " ");
      const genericWords = new Set(["name", "unknown", "n/a", "tbc", "tbd", "first", "last", "surname", "full", "client", "resident", "patient", "person", "service", "user", "enter"]);
      const nameWords = lowerName.split(" ");
      if (nameWords.every(w => genericWords.has(w))) continue;
      return fullName;
    }
  }
  return "";
};

const extractJsonObject = (content: string): string | null => {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < content.length; i++) {
    const char = content[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\" && inString) {
      escape = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return content.slice(start, i + 1);
      }
    }
  }
  return null;
};

const parseJsonFromContent = (content: string): any | null => {
  const jsonText = extractJsonObject(content);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    const cleaned = jsonText.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
};

const coerceProtocolText = (value: unknown): string => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed;
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => coerceProtocolText(item))
      .filter(Boolean)
      .join("; ")
      .trim();
    return joined;
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const preferredKeys = ["text", "value", "description", "content", "label", "name"];
    for (const key of preferredKeys) {
      const extracted = coerceProtocolText(objectValue[key]);
      if (extracted) return extracted;
    }
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const normalizePrnProtocol = (rawProtocol: any, medicationName: string) => {
  const source = rawProtocol && typeof rawProtocol === "object" ? rawProtocol : {};
  const getAny = (...keys: string[]) => {
    for (const key of keys) {
      const value = coerceProtocolText((source as Record<string, unknown>)[key]);
      if (value) return value;
    }
    return "";
  };

  const normalized = {
    medicationName:
      getAny("medicationName", "medication", "name") || medicationName,
    dose:
      getAny("dose", "recommendedDose", "dosage") ||
      "Follow MAR chart and prescriber instructions.",
    route:
      getAny("route", "administrationRoute") ||
      "Follow MAR chart and prescriber instructions.",
    frequency:
      getAny("frequency", "administrationFrequency") ||
      "Administer only when clinically indicated and as prescribed.",
    maxDoseIn24Hours:
      getAny("maxDoseIn24Hours", "maxDose24Hours", "maximumDoseIn24Hours") ||
      "Do not exceed prescribed 24-hour maximum on the MAR chart.",
    minimumTimeBetweenDoses:
      getAny("minimumTimeBetweenDoses", "minimumInterval", "minimumTimeBetweenAdministrations") ||
      "Observe the minimum interval stated on the MAR chart.",
    specialInstructions:
      getAny("specialInstructions", "instructions", "administrationInstructions") ||
      "Check indication, allergies, recent administrations, and document rationale before/after administration.",
    reasonsForAdministration:
      getAny("reasonsForAdministration", "indications", "reasons", "whenToGive") ||
      "Only administer for prescribed indications; verify symptoms and care plan guidance before giving.",
    predictableSideEffects:
      getAny("predictableSideEffects", "sideEffects", "commonSideEffects") ||
      "Monitor for expected side effects per medication guidance and escalate concerns promptly.",
    additionalComments:
      getAny("additionalComments", "comments", "notes") ||
      "If unsure, do not administer and seek senior/clinical advice. Record all decisions in care notes.",
  };

  return normalized;
};

const getLowCostModel = () => "gpt-4.1-mini";
const getAccurateModel = () => getLowCostModel(); // temporarily low cost
const getRiskAssessmentModel = () => getLowCostModel(); // temporarily low cost
const getRiskAssessmentRecommendationModel = () => getLowCostModel();
const getRiskAssessmentGenerationModel = () => getLowCostModel();

const inferGenericNameFromMedicationLabel = (name: string): string => {
  if (!name) return "";
  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(micrograms?|milligrams?|grams?|millilitres?)\b/g, " ")
    .replace(/\b(tablets?|capsules?|caps?|tab|cap|patches?|sprays?|drops?|solution|syrup|suspension|ointment|cream|gel|inhaler|injection|ampoules?|nebules?|puffs?)\b/g, " ")
    .replace(/\b(oral|topical|subcutaneous|intravenous|iv|im|pr|sc)\b/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned.split(" ").filter(token => token.length >= 3);
  return tokens[0] || "";
};

const normalizeAssessmentName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");

const ASSESSMENT_NAME_ALIASES: Record<string, string> = {
  "moving and handling": "Mobility & Moving and Handling",
  "moving & handling": "Mobility & Moving and Handling",
  "mobility and handling": "Mobility & Moving and Handling",
  "manual handling": "Mobility & Moving and Handling",
  "medication": "Medication Administration",
  "medication support": "Medication Administration",
  "meds administration": "Medication Administration",
  "nutrition and hydration": "Nutrition",
  "hydration": "Nutrition",
  "pressure area care": "Skin Integrity",
  "pressure care": "Skin Integrity",
  "pressure areas": "Skin Integrity",
  "falls": "Falls Prevention",
  "falls risk": "Falls Prevention",
  "mental health support": "Mental Health",
  "behaviour support": "Behavior Support",
  "behavioural support": "Behavior Support",
  "behavioral support": "Behavior Support",
  "communication needs": "Communication",
  "infection": "Infection Control",
  "fire": "Fire Safety",
  "environment": "Environmental Safety",
  "safeguarding adults": "Safeguarding",
  "coshh assessment": "COSHH",
  "diabetes": "Diabetes Management",
  "epilepsy": "Epilepsy Management",
  "continence": "Continence Care",
  "dementia": "Dementia Care",
  "end of life": "End of Life Care",
  "palliative care": "End of Life Care",
  "personal care support": "Personal Care",
};

const normalizeAssessmentKey = (name: string) => {
  const base = normalizeAssessmentName(name);
  const alias = ASSESSMENT_NAME_ALIASES[base];
  return normalizeAssessmentName(alias || base);
};

const canonicalizeAssessmentName = (name: string) => {
  const base = normalizeAssessmentName(name);
  const alias = ASSESSMENT_NAME_ALIASES[base];
  return alias || name.trim();
};

const ASSESSMENT_EVIDENCE_TERMS: Record<string, string[]> = {
  "nutrition": ["nutrition", "feed", "feeding", "meal", "diet", "hydration", "swallow", "appetite", "thicken", "puree", "peg", "enteral", "tube feed", "weight loss", "malnutrition"],
  "diabetes management": ["diabet", "insulin", "blood glucose", "glucose", "hypo", "hypergly"],
  "epilepsy management": ["epilep", "seizure"],
  "medication administration": ["medication", "medicine", "tablet", "drug", "prescription", "mar", "dosette", "blister pack", "inhaler", "drops", "cream", "patch"],
  "mobility and moving and handling": ["mobility", "transfer", "moving", "handling", "hoist", "wheelchair", "zimmer", "frame", "walker", "walking aid", "stairs", "reposition", "stand aid", "sit to stand"],
  "personal care": ["personal care", "wash", "bathing", "shower", "toilet", "toileting", "dressing", "groom", "oral care", "hair", "shave"],
  "skin integrity": ["skin", "pressure", "ulcer", "wound", "sore", "pressure area", "skin tear"],
  "falls prevention": ["fall", "falls", "unsteady", "trip", "slip", "balance", "previous fall"],
  "continence care": ["continence", "incontinence", "catheter", "pad", "bowel", "urinary", "toileting"],
  "dementia care": ["dementia", "cognit", "alzheimer", "memory", "confus", "orientat", "capacity"],
  "mental health": ["mental health", "depress", "anxiety", "bipolar", "psych", "schiz", "ptsd", "stress"],
  "communication": ["communication", "speech", "hearing", "vision", "aphasia", "language", "non verbal", "interpreter"],
  "behavior support": ["behaviour", "behavior", "challenging", "aggression", "agitated", "agitation", "self harm", "wandering", "abscond"],
  "end of life care": ["palliative", "end of life", "terminal", "hospice", "dnacpr", "eol"],
  "infection control": ["infection", "wound", "catheter", "mrsa", "uti", "covid", "flu", "sepsis"],
  "fire safety": ["fire", "smoking", "smoke alarm", "oxygen", "cigarette", "matches"],
  "environmental safety": ["environment", "hazard", "trip", "clutter", "uneven", "lighting", "temperature"],
  "lone working": ["lone working", "single carer", "alone", "two carers", "double up"],
  "safeguarding": ["safeguard", "abuse", "neglect", "financial", "exploitation", "self neglect"],
  "coshh": ["coshh", "chemical", "cleaning", "bleach", "disinfectant", "detergent"],
};

const collectAssessmentEvidence = (
  analysis: { medicalConditions?: string[]; careActivities?: string[]; concerns?: string[] },
  terms: string[]
) => {
  const sources = [
    ...(analysis.medicalConditions || []),
    ...(analysis.careActivities || []),
    ...(analysis.concerns || []),
  ];
  const seen = new Set<string>();
  const matches: string[] = [];

  for (const item of sources) {
    if (!item) continue;
    const lower = item.toLowerCase();
    if (terms.some((term) => lower.includes(term))) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        matches.push(item);
        if (matches.length >= 2) break;
      }
    }
  }
  return matches;
};

const truncateEvidence = (text: string, maxLength = 160) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

const QUESTION_LIKE_PATTERNS = [
  /\?/,
  /^\s*(q:|question\b)/i,
  /^\s*(do|does|did|is|are|was|were|have|has|had|can|could|would|should|may|might|must)\b/i,
  /\bdo you have\b/i,
  /\bdoes the service user\b/i,
  /\bdo they have\b/i,
  /\bhas the service user\b/i,
  /\bare there\b/i,
  /\bany history of\b/i,
  /\bplease (state|describe|specify|confirm)\b/i,
  /\byes\s*\/\s*no\b/i,
  /\byes\s+no\b/i,
  /\b(check|tick)\b/i,
  /\bselect (one|all|any)\b/i,
  /\bif yes\b/i,
  /\bif no\b/i,
  /\bn\/a\b/i,
];

const isQuestionLikeText = (text: string | undefined | null): boolean => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return QUESTION_LIKE_PATTERNS.some((pattern) => pattern.test(trimmed));
};

const buildDocumentEvidenceFinder = (documentContent: string) => {
  const content = documentContent || "";
  const lower = content.toLowerCase();

  const findSnippets = (terms: string[], maxMatches = 2) => {
    if (!content || terms.length === 0) return [];
    const snippets: string[] = [];
    const seen = new Set<string>();

    for (const term of terms) {
      if (!term) continue;
      const needle = term.toLowerCase();
      const index = lower.indexOf(needle);
      if (index < 0) continue;
      const start = Math.max(0, index - 60);
      const end = Math.min(content.length, index + needle.length + 60);
      const snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
      if (!snippet) continue;
      if (isQuestionLikeText(snippet)) continue;
      const key = snippet.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      snippets.push(truncateEvidence(snippet));
      if (snippets.length >= maxMatches) break;
    }
    return snippets;
  };

  const findAllSnippets = (terms: string[], maxMatches = 8) => {
    if (!content || terms.length === 0) return [];
    const snippets: string[] = [];
    const seen = new Set<string>();

    for (const term of terms) {
      if (!term) continue;
      const needle = term.toLowerCase();
      let startIndex = 0;
      while (startIndex < lower.length) {
        const index = lower.indexOf(needle, startIndex);
        if (index < 0) break;
        const start = Math.max(0, index - 70);
        const end = Math.min(content.length, index + needle.length + 70);
        const snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
        startIndex = index + needle.length;
        if (!snippet) continue;
        if (isQuestionLikeText(snippet)) continue;
        const key = snippet.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        snippets.push(truncateEvidence(snippet));
        if (snippets.length >= maxMatches) return snippets;
      }
    }
    return snippets;
  };

  return { findSnippets, findAllSnippets };
};

const normalizeStringArray = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (isQuestionLikeText(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
};

const isNegatedEvidence = (value: string): boolean => {
  const lower = value.toLowerCase();
  const patterns = [
    /\bno (known |documented |reported )?(risk|risks|concerns?)\b/,
    /\bno evidence\b/,
    /\bnot (reported|documented|noted|mentioned)\b/,
    /\bwithout (any |known )?(risk|risks|concerns?)\b/,
    /\bdenies\b/,
    /\bnone reported\b/,
    /\binformation not found\b/,
  ];
  return patterns.some((pattern) => pattern.test(lower));
};

const isMeaningfulEvidence = (value: string | undefined | null): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const wordCount = trimmed.split(/\s+/).filter((token) => /[a-z0-9]/i.test(token)).length;
  if (wordCount < 2) return false;
  if (trimmed.length < 8) return false;
  const lower = trimmed.toLowerCase();
  if (lower.includes("information not found in documents")) return false;
  if (lower.includes("i'm not aware of") || lower.includes("im not aware of")) return false;
  if (lower.includes("not found in the provided documents")) return false;
  if (isQuestionLikeText(trimmed)) return false;
  if (isNegatedEvidence(trimmed)) return false;
  return true;
};

const OUT_OF_SCOPE_PATTERNS = [
  /\bprescrib(e|ing|ed)\b/i,
  /\bdiagnos(e|is|ing)\b/i,
  /\bchange (medication|dose|dosage)\b/i,
  /\badjust (medication|dose|dosage)\b/i,
  /\badminister (iv|intravenous|injection|inject)\b/i,
  /\bset up (iv|intravenous)\b/i,
  /\bcatheter(i[sz]e|isation|ization|insert|remove)\b/i,
  /\bdebrid(e|ement)\b/i,
  /\bstitch|suturing\b/i,
  /\binterpret (ecg|x-ray|scan|ct|mri)\b/i,
];

const sanitizeOutOfScopeText = (text: string) => {
  if (!text) return text;
  const hasOutOfScope = OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
  if (!hasOutOfScope) return text;
  return "Follow the care plan, record observations and escalate to a registered professional or GP for any clinical decisions.";
};

/**
 * Check if evidence snippets show diverse aspects (not just repetition)
 * Returns true if snippets cover different aspects of the risk
 */
const hasEvidenceDiversity = (snippets: string[]): boolean => {
  if (snippets.length < 2) return false;
  
  // Check for significant word overlap between snippets
  const getSignificantWords = (text: string): Set<string> => {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3); // Only words longer than 3 chars
    return new Set(words);
  };
  
  // Compare each pair of snippets
  for (let i = 0; i < snippets.length - 1; i++) {
    for (let j = i + 1; j < snippets.length; j++) {
      const words1 = getSignificantWords(snippets[i]);
      const words2 = getSignificantWords(snippets[j]);
      
      // Count overlapping words
      const overlap = [...words1].filter(w => words2.has(w)).length;
      const minSize = Math.min(words1.size, words2.size);
      
      // If less than 60% overlap, they're diverse enough
      if (minSize > 0 && overlap / minSize < 0.6) {
        return true; // Found at least one diverse pair
      }
    }
  }
  
  // All snippets are too similar
  return false;
};

/**
 * Detect if an assessment is too similar to others already included
 * Prevents duplicate recommendations for the same underlying issue
 */
const isSimilarAssessment = (assessment: string, existingAssessments: string[]): boolean => {
  const key1 = normalizeAssessmentKey(assessment);
  
  // Check for exact duplicates or very similar names
  return existingAssessments.some(existing => {
    const key2 = normalizeAssessmentKey(existing);
    
    // Exact match
    if (key1 === key2) return true;
    
    // Check for overlapping key terms
    const words1 = key1.split(/[\s_]+/).filter(w => w.length > 3);
    const words2 = key2.split(/[\s_]+/).filter(w => w.length > 3);
    
    if (words1.length === 0 || words2.length === 0) return false;
    
    // Count matching significant words
    const matches = words1.filter(w => words2.includes(w)).length;
    const similarity = matches / Math.min(words1.length, words2.length);
    
    // 70%+ word overlap = too similar
    return similarity >= 0.7;
  });
};

/**
 * Score evidence quality from 0-100
 * Higher scores = stronger, more specific evidence
 * Lower scores = vague, generic, weak evidence
 */
const scoreEvidenceQuality = (evidence: string, evidenceSnippets: string[]): number => {
  let score = 0;
  
  // Check main evidence field
  const evidenceLower = evidence.toLowerCase();
  const wordCount = evidence.split(/\s+/).length;
  
  // Base score from evidence length and detail
  if (wordCount >= 15) score += 20; // Detailed evidence
  else if (wordCount >= 10) score += 15;
  else if (wordCount >= 5) score += 10;
  else score += 5; // Very short evidence
  
  // Bonus for specific medical terms or conditions
  const specificTerms = [
    'diabetes', 'dementia', 'parkinson', 'stroke', 'arthritis', 
    'copd', 'asthma', 'epilepsy', 'cardiac', 'hypertension',
    'fall', 'fell', 'fracture', 'injury', 'wound', 'pressure sore',
    'catheter', 'stoma', 'peg', 'hoist', 'wheelchair',
    'swallowing', 'dysphagia', 'choking', 'aspiration'
  ];
  const matchedSpecificTerms = specificTerms.filter(term => evidenceLower.includes(term)).length;
  score += matchedSpecificTerms * 8; // 8 points per specific term
  
  // Bonus for quantifiable details (dates, numbers, frequencies)
  const hasNumbers = /\d+/.test(evidence);
  const hasDates = /(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|last week|yesterday|today)/i.test(evidence);
  const hasFrequency = /(daily|weekly|monthly|twice|three times|frequently|often|regular)/i.test(evidence);
  if (hasNumbers) score += 5;
  if (hasDates) score += 8; // Recent events are valuable
  if (hasFrequency) score += 6;
  
  // Penalty for vague phrases
  const vagueTerms = [
    'may need', 'might need', 'could need', 'possibly',
    'general support', 'as needed', 'if required',
    'appropriate care', 'standard care', 'normal care',
    'suitable assessment', 'various needs'
  ];
  const matchedVagueTerms = vagueTerms.filter(term => evidenceLower.includes(term)).length;
  score -= matchedVagueTerms * 10; // -10 points per vague term
  
  // Check evidence snippets quality
  const meaningfulSnippets = evidenceSnippets.filter(isMeaningfulEvidence);
  score += meaningfulSnippets.length * 15; // 15 points per snippet
  
  // Bonus for evidence diversity (different aspects, not repetition)
  if (meaningfulSnippets.length >= 2 && hasEvidenceDiversity(meaningfulSnippets)) {
    score += 20; // Significant bonus for diverse evidence
  }
  
  // Bonus for snippets with specific details
  meaningfulSnippets.forEach(snippet => {
    const snippetWords = snippet.split(/\s+/).length;
    if (snippetWords >= 10) score += 10; // Detailed snippet
    
    // Check for quotes from documents
    if (snippet.includes('"') || snippet.includes('states') || snippet.includes('reports')) {
      score += 5; // Direct quote/reference
    }
    
    // Check for temporal context (recent events are more relevant)
    if (/(last|past|recent|yesterday|this week|this month)/i.test(snippet)) {
      score += 7; // Recent evidence
    }
  });
  
  // Penalty for generic assessment names in evidence
  const genericPhrases = [
    'requires assessment', 'needs assessment', 'assessment recommended',
    'should be assessed', 'assessment required'
  ];
  if (genericPhrases.some(phrase => evidenceLower.includes(phrase))) {
    score -= 15; // Generic recommendation
  }
  
  // Cap score between 0-100
  return Math.max(0, Math.min(100, score));
};

const isAssessmentRelevantServer = (
  assessment: { name?: string; reason?: string; evidence?: string; evidenceSnippets?: string[] },
  analysis: { medicalConditions?: string[]; careActivities?: string[]; concerns?: string[]; equipment?: string[]; communicationNeeds?: string[]; environmentalFactors?: string[]; documentSummary?: string }
): boolean => {
  if (!assessment?.name) return false;
  if (!assessment?.evidence || !assessment.evidence.trim()) return false;
  if (isNegatedEvidence(assessment.evidence) || isNegatedEvidence(assessment.reason || "")) return false;

  const key = normalizeAssessmentKey(assessment.name);
  const terms = ASSESSMENT_EVIDENCE_TERMS[key];
  if (!terms || terms.length === 0) return true;

  // Include ALL service user profile fields in the search haystack
  const haystack = [
    assessment.name,
    assessment.reason,
    assessment.evidence,
    ...(assessment.evidenceSnippets || []),
    analysis.documentSummary,
    ...(analysis.concerns || []),
    ...(analysis.medicalConditions || []),
    ...(analysis.careActivities || []),
    ...(analysis.equipment || []),
    ...(analysis.communicationNeeds || []),
    ...(analysis.environmentalFactors || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return terms.some((term) => haystack.includes(term));
};

const pickEvidenceSnippet = (snippets: string[]): string => {
  if (!Array.isArray(snippets) || snippets.length === 0) return "";
  const candidate = snippets.find((snippet) => isMeaningfulEvidence(snippet));
  return candidate ? truncateEvidence(candidate) : "";
};

// NO ASSESSMENTS ARE AUTOMATICALLY MANDATORY
// CQC 2024 Principle: Risk assessments must be person-centred and based on individual needs
// NHS England Principle: Risk management should be proportionate to the individual's circumstances
const ALWAYS_MANDATORY_ASSESSMENTS = new Set<string>([
  // Intentionally empty - assessments are recommended only when supported by documented evidence
]);

const buildAssessmentRecommendations = (analysis: {
  medicalConditions?: string[];
  careActivities?: string[];
  concerns?: string[];
  equipment?: string[];
  communicationNeeds?: string[];
  environmentalFactors?: string[];
}, evidenceFinder?: { findSnippets: (terms: string[], maxMatches?: number) => string[]; findAllSnippets: (terms: string[], maxMatches?: number) => string[] }): { name: string; isMandatory: boolean; reason: string; evidence?: string; evidenceSnippets?: string[] }[] => {
  const recommendations: { name: string; isMandatory: boolean; reason: string; evidence?: string; evidenceSnippets?: string[] }[] = [];
  const add = (name: string, reason: string, evidence?: string, evidenceSnippets?: string[], forceMandatory?: boolean) => {
    const isMandatory = forceMandatory || ALWAYS_MANDATORY_ASSESSMENTS.has(normalizeAssessmentKey(name));
    recommendations.push({ name: canonicalizeAssessmentName(name), isMandatory, reason, evidence, evidenceSnippets });
  };

  const addIfEvidence = (name: string, terms: string[], reason: string) => {
    if (!evidenceFinder) return;
    const snippets = evidenceFinder.findAllSnippets(terms);
    const evidence = pickEvidenceSnippet(snippets);
    if (!evidence) return;
    add(name, reason, evidence, snippets);
  };

  // Check service user profile arrays directly for quick matching
  const profileText = [
    ...(analysis.medicalConditions || []),
    ...(analysis.careActivities || []),
    ...(analysis.concerns || []),
    ...(analysis.equipment || []),
    ...(analysis.communicationNeeds || []),
    ...(analysis.environmentalFactors || []),
  ].join(" ").toLowerCase();

  // Profile-based recommendations with evidence lookup
  addIfEvidence("Diabetes Management", ASSESSMENT_EVIDENCE_TERMS["diabetes management"], "Service user profile indicates diabetes.");
  addIfEvidence("Epilepsy Management", ASSESSMENT_EVIDENCE_TERMS["epilepsy management"], "Service user profile indicates epilepsy or seizures.");
  addIfEvidence("Medication Administration", ASSESSMENT_EVIDENCE_TERMS["medication administration"], "Service user requires medication support.");
  addIfEvidence("Nutrition", ASSESSMENT_EVIDENCE_TERMS["nutrition"], "Service user requires nutrition or hydration support.");
  addIfEvidence("Mobility & Moving and Handling", ASSESSMENT_EVIDENCE_TERMS["mobility and moving and handling"], "Service user requires mobility or transfer support.");
  addIfEvidence("Personal Care", ASSESSMENT_EVIDENCE_TERMS["personal care"], "Service user requires personal care support.");
  addIfEvidence("Skin Integrity", ASSESSMENT_EVIDENCE_TERMS["skin integrity"], "Service user has skin integrity or pressure area concerns.");
  addIfEvidence("Falls Prevention", ASSESSMENT_EVIDENCE_TERMS["falls prevention"], "Service user has fall risk factors in their profile.");
  addIfEvidence("Continence Care", ASSESSMENT_EVIDENCE_TERMS["continence care"], "Service user requires continence support.");
  addIfEvidence("Dementia Care", ASSESSMENT_EVIDENCE_TERMS["dementia care"], "Service user profile indicates cognitive impairment.");
  addIfEvidence("Mental Health", ASSESSMENT_EVIDENCE_TERMS["mental health"], "Service user profile indicates mental health needs.");
  addIfEvidence("Communication", ASSESSMENT_EVIDENCE_TERMS["communication"], "Service user has communication or sensory needs.");
  addIfEvidence("Behavior Support", ASSESSMENT_EVIDENCE_TERMS["behavior support"], "Service user profile indicates behaviour support needs.");
  addIfEvidence("End of Life Care", ASSESSMENT_EVIDENCE_TERMS["end of life care"], "Service user requires end of life or palliative care.");
  addIfEvidence("Infection Control", ASSESSMENT_EVIDENCE_TERMS["infection control"], "Service user profile indicates infection control considerations.");
  addIfEvidence("Fire Safety", ASSESSMENT_EVIDENCE_TERMS["fire safety"], "Service user profile indicates fire safety considerations.");
  addIfEvidence("Environmental Safety", ASSESSMENT_EVIDENCE_TERMS["environmental safety"], "Service user's environment has identified hazards.");
  addIfEvidence("Lone Working", ASSESSMENT_EVIDENCE_TERMS["lone working"], "Care setting requires lone working considerations.");
  addIfEvidence("Safeguarding", ASSESSMENT_EVIDENCE_TERMS["safeguarding"], "Service user profile indicates safeguarding concerns.");
  addIfEvidence("COSHH", ASSESSMENT_EVIDENCE_TERMS["coshh"], "Care activities involve chemical or cleaning product handling.");

  return recommendations;
};

const mergeAssessmentRecommendations = (
  existing: Array<{ name: string; isMandatory?: boolean; reason?: string; evidence?: string; evidenceSnippets?: string[] }> = [],
  derived: Array<{ name: string; isMandatory?: boolean; reason?: string; evidence?: string; evidenceSnippets?: string[] }> = []
) => {
  const merged = new Map<string, { name: string; isMandatory: boolean; reason: string; evidence?: string; evidenceSnippets?: string[] }>();
  const apply = (item: { name: string; isMandatory?: boolean; reason?: string; evidence?: string; evidenceSnippets?: string[] }) => {
    if (!item?.name) return;
    const key = normalizeAssessmentKey(item.name);
    if (!key) return;
    const canonicalName = canonicalizeAssessmentName(item.name);
    const evidenceSnippets = Array.isArray(item.evidenceSnippets) ? item.evidenceSnippets.filter(isMeaningfulEvidence) : [];
    const normalized = {
      name: canonicalName,
      isMandatory: Boolean(item.isMandatory),
      reason: item.reason?.trim() || (item.evidence?.trim() ? "Evidence noted in documents." : ""),
      evidence: item.evidence?.trim() || "",
      evidenceSnippets,
    };
    const current = merged.get(key);
    if (!current) {
      merged.set(key, normalized);
      return;
    }
    current.isMandatory = current.isMandatory || normalized.isMandatory;
    if (!current.reason && normalized.reason) current.reason = normalized.reason;
    if (!current.evidence && normalized.evidence) current.evidence = normalized.evidence;
    if (normalized.evidenceSnippets && normalized.evidenceSnippets.length) {
      const existingSnippets = Array.isArray(current.evidenceSnippets) ? current.evidenceSnippets : [];
      const mergedSnippets = [...existingSnippets, ...normalized.evidenceSnippets];
      const seen = new Set<string>();
      current.evidenceSnippets = mergedSnippets.filter((snippet) => {
        const key = snippet.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (current.evidence && normalized.evidence && current.evidence !== normalized.evidence) {
      const combinedEvidence = `${current.evidence}; ${normalized.evidence}`;
      current.evidence = truncateEvidence(combinedEvidence);
    }
  };

  derived.forEach(apply);
  existing.forEach(apply);

  return Array.from(merged.values()).sort((a, b) => {
    if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
};

const extractSummaryEvidence = (summary: string, terms: string[]) => {
  if (!summary) return "";
  const summaryLower = summary.toLowerCase();
  for (const term of terms) {
    const index = summaryLower.indexOf(term);
    if (index >= 0) {
      const start = Math.max(0, index - 50);
      const end = Math.min(summary.length, index + term.length + 50);
      return truncateEvidence(summary.slice(start, end).trim());
    }
  }
  return "";
};

const attachAssessmentEvidence = (
  recommendations: Array<{ name: string; isMandatory?: boolean; reason?: string; evidence?: string; evidenceSnippets?: string[] }>,
  analysis: { medicalConditions?: string[]; careActivities?: string[]; concerns?: string[]; documentSummary?: string },
  evidenceFinder?: { findSnippets: (terms: string[], maxMatches?: number) => string[]; findAllSnippets: (terms: string[], maxMatches?: number) => string[] }
) =>
  recommendations.map((item) => {
    const evidenceTerms = ASSESSMENT_EVIDENCE_TERMS[normalizeAssessmentKey(item.name)] || [];
    if (!evidenceFinder || evidenceTerms.length === 0) {
      return { ...item, name: canonicalizeAssessmentName(item.name), evidence: "" };
    }
    const snippets = evidenceFinder.findAllSnippets(evidenceTerms).filter(isMeaningfulEvidence);
    const evidence = pickEvidenceSnippet(snippets);
    return {
      ...item,
      name: canonicalizeAssessmentName(item.name),
      evidence,
      evidenceSnippets: snippets,
    };
  });

type RiskAnalysisCacheEntry = {
  payload: any;
  createdAt: number;
};

const riskAnalysisCache = new Map<string, RiskAnalysisCacheEntry>();
const RISK_ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RISK_ANALYSIS_CACHE_ENTRIES = 40;

const getRiskAnalysisCache = (key: string) => {
  const entry = riskAnalysisCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > RISK_ANALYSIS_CACHE_TTL_MS) {
    riskAnalysisCache.delete(key);
    return null;
  }
  return entry.payload;
};

const setRiskAnalysisCache = (key: string, payload: any) => {
  riskAnalysisCache.set(key, { payload, createdAt: Date.now() });
  if (riskAnalysisCache.size <= MAX_RISK_ANALYSIS_CACHE_ENTRIES) return;
  const entries = Array.from(riskAnalysisCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
  const overflow = entries.length - MAX_RISK_ANALYSIS_CACHE_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    riskAnalysisCache.delete(entries[i][0]);
  }
};

const normalizeRiskRating = (value: unknown) => {
  if (typeof value !== "string") return "Low";
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("high")) return "High";
  if (normalized.includes("medium")) return "Medium";
  if (normalized.includes("low")) return "Low";
  return "Low";
};

const RULE_BASED_SIGNAL_GROUPS = {
  medicalConditions: [
    { label: "Diabetes", terms: ["diabet", "insulin", "blood glucose", "hypogly", "hypergly"] },
    { label: "Dementia or cognitive impairment", terms: ["dementia", "alzheimer", "memory", "cognit", "confus"] },
    { label: "Epilepsy or seizures", terms: ["epilep", "seizure"] },
    { label: "Respiratory condition", terms: ["copd", "asthma", "breathless", "oxygen", "inhaler"] },
    { label: "Cardiovascular condition", terms: ["heart", "cardiac", "angina", "hypertension", "bp"] },
    { label: "Arthritis or musculoskeletal condition", terms: ["arthritis", "joint pain", "mobility pain"] },
    { label: "Mental health condition", terms: ["depress", "anxiety", "psych", "low mood"] },
  ],
  careActivities: [
    { label: "Medication support", terms: ["medication", "medicine", "tablet", "dosette", "blister pack", "mar"] },
    { label: "Personal care support", terms: ["wash", "bathing", "shower", "dressing", "toilet", "toileting"] },
    { label: "Mobility and transfers", terms: ["mobility", "transfer", "hoist", "stand aid", "wheelchair", "walking frame"] },
    { label: "Nutrition and hydration support", terms: ["meal", "diet", "nutrition", "hydration", "feeding", "swallow"] },
    { label: "Continence support", terms: ["continence", "incontinence", "catheter", "pad", "bowel", "urinary"] },
    { label: "Communication support", terms: ["communication", "speech", "hearing", "vision", "interpreter"] },
  ],
  concerns: [
    { label: "Falls risk", terms: ["fall", "unsteady", "trip", "slip", "balance"] },
    { label: "Skin integrity risk", terms: ["pressure", "ulcer", "wound", "skin tear", "sore"] },
    { label: "Choking or aspiration risk", terms: ["choking", "aspiration", "dysphagia", "thickened"] },
    { label: "Medication safety risk", terms: ["medication error", "missed medication", "time critical"] },
    { label: "Behavior or safeguarding concern", terms: ["agitation", "aggressive", "wandering", "self neglect", "abuse"] },
    { label: "Infection risk", terms: ["infection", "uti", "mrsa", "sepsis", "covid"] },
  ],
  equipment: [
    { label: "Hoist", terms: ["hoist"] },
    { label: "Stand aid", terms: ["stand aid", "sara steady"] },
    { label: "Wheelchair", terms: ["wheelchair"] },
    { label: "Walking frame", terms: ["walking frame", "zimmer", "rollator"] },
    { label: "Hospital/profiling bed", terms: ["hospital bed", "profiling bed"] },
    { label: "Pressure-relieving equipment", terms: ["pressure mattress", "pressure cushion"] },
    { label: "Assistive bathroom equipment", terms: ["shower chair", "bath board", "toilet frame", "commode", "grab rails"] },
    { label: "Telecare or falls alarm", terms: ["falls sensor", "telecare", "pendant alarm"] },
  ],
  communicationNeeds: [
    { label: "Hearing support", terms: ["hearing", "hearing aid"] },
    { label: "Vision support", terms: ["vision", "eyesight", "glasses"] },
    { label: "Speech/language support", terms: ["speech", "aphasia", "language"] },
    { label: "Cognitive communication support", terms: ["memory", "confus", "orientation"] },
  ],
  environmentalFactors: [
    { label: "Stairs or step access", terms: ["stairs", "steps", "upstairs"] },
    { label: "Key safe or controlled access", terms: ["key safe", "keysafe", "key box"] },
    { label: "Fire safety considerations", terms: ["smoke alarm", "fire", "smoking", "oxygen near heat"] },
    { label: "Clutter or trip hazards", terms: ["clutter", "trip hazard", "uneven flooring", "poor lighting"] },
    { label: "Lone working considerations", terms: ["lone working", "single carer", "double up care"] },
  ],
};

const extractSignalLabels = (
  content: string,
  groups: Array<{ label: string; terms: string[] }>
) => {
  if (!content) return [] as string[];
  const lower = content.toLowerCase();
  return groups
    .filter((group) => group.terms.some((term) => lower.includes(term)))
    .map((group) => group.label);
};

const fallbackRiskProfileSummary = (analysis: {
  careActivities: string[];
  concerns: string[];
  medicalConditions: string[];
}) => {
  const segments: string[] = [];
  if (analysis.medicalConditions.length > 0) {
    segments.push(`I have documented health needs including ${analysis.medicalConditions.slice(0, 3).join(", ")}.`);
  }
  if (analysis.careActivities.length > 0) {
    segments.push(`I need support with ${analysis.careActivities.slice(0, 3).join(", ")}.`);
  }
  if (analysis.concerns.length > 0) {
    segments.push(`My records identify risks around ${analysis.concerns.slice(0, 3).join(", ")}.`);
  }
  if (segments.length === 0) {
    return "I need a person-centred review of my care needs based on the documents provided.";
  }
  return toFirstPerson(segments.join(" "));
};

const deescalateRiskRating = (rating: "Low" | "Medium" | "High"): "Low" | "Medium" | "High" => {
  if (rating === "High") return "Medium";
  return "Low";
};

const buildRuleBasedRiskAnalysisPayload = (
  documentContent: string,
  allowSensitiveView: boolean
) => {
  const fullName = normalizeFullName(extractServiceUserFullName(documentContent));
  const serviceUser = allowSensitiveView && fullName
    ? { fullName, initials: normalizeInitials(fullName) }
    : { initials: normalizeInitials(fullName || "N.N.") };
  const medicalConditions = extractSignalLabels(documentContent, RULE_BASED_SIGNAL_GROUPS.medicalConditions);
  const careActivities = extractSignalLabels(documentContent, RULE_BASED_SIGNAL_GROUPS.careActivities);
  const concerns = extractSignalLabels(documentContent, RULE_BASED_SIGNAL_GROUPS.concerns);
  const equipment = extractSignalLabels(documentContent, RULE_BASED_SIGNAL_GROUPS.equipment);
  const communicationNeeds = extractSignalLabels(documentContent, RULE_BASED_SIGNAL_GROUPS.communicationNeeds);
  const environmentalFactors = extractSignalLabels(documentContent, RULE_BASED_SIGNAL_GROUPS.environmentalFactors);

  const riskAnalysis = analyzeRiskLevel(documentContent);
  const evidenceFinder = buildDocumentEvidenceFinder(documentContent);
  const extractedFields = extractCommonFields(documentContent);
  if (extractedFields.orientation) concerns.push(`Orientation status: ${extractedFields.orientation}`);
  if (extractedFields.memory) concerns.push(`Memory status: ${extractedFields.memory}`);
  if (extractedFields.moods) concerns.push(`Mood profile: ${extractedFields.moods}`);

  let recommendedAssessments = buildAssessmentRecommendations(
    { medicalConditions, careActivities, concerns, equipment, communicationNeeds, environmentalFactors },
    evidenceFinder
  );

  if (!recommendedAssessments.length) {
    const fallbackNames = [
      "Medication Administration",
      "Mobility & Moving and Handling",
      "Personal Care",
      "Nutrition",
      "Environmental Safety",
    ];
    recommendedAssessments = fallbackNames.map((name) => {
      const key = normalizeAssessmentKey(name);
      const terms = ASSESSMENT_EVIDENCE_TERMS[key] || [];
      const snippets = evidenceFinder.findAllSnippets(terms, 3).filter(isMeaningfulEvidence);
      const evidence =
        pickEvidenceSnippet(snippets) ||
        truncateEvidence((documentContent || "").replace(/\s+/g, " ").trim(), 180) ||
        "Information recorded in uploaded documents.";
      return {
        name,
        isMandatory: false,
        reason: toFirstPerson(`I need this assessment to manage my documented care needs safely.`),
        evidence,
        evidenceSnippets: snippets.length ? snippets : [evidence],
      };
    });
  }

  const dedupedConcerns = normalizeStringArray(concerns);
  return {
    serviceUser,
    medicalConditions,
    careActivities,
    concerns: dedupedConcerns.length ? dedupedConcerns : [riskAnalysis.reason],
    equipment,
    communicationNeeds,
    environmentalFactors,
    recommendedAssessments: recommendedAssessments.map((item) => ({
      ...item,
      isMandatory: false,
      reason: toFirstPerson(item.reason || "I need this assessment to manage identified risks."),
      evidenceSnippets: normalizeStringArray(item.evidenceSnippets).filter(isMeaningfulEvidence),
    })),
    documentSummary: fallbackRiskProfileSummary({ medicalConditions, careActivities, concerns: dedupedConcerns }),
    generationMode: "rule-based",
  };
};

const buildRuleBasedRiskAssessmentPayload = (params: {
  documentContent: string;
  assessmentCategory: string;
  serviceUserInitials?: string;
  performedBy?: string;
  performedByJobTitle?: string;
}) => {
  const { documentContent, assessmentCategory, serviceUserInitials, performedBy, performedByJobTitle } = params;
  const category = canonicalizeAssessmentName(assessmentCategory || "General Risk Assessment");
  const key = normalizeAssessmentKey(category);
  const evidenceTerms = ASSESSMENT_EVIDENCE_TERMS[key] || [];
  const evidenceFinder = buildDocumentEvidenceFinder(documentContent);
  const snippets = evidenceFinder.findAllSnippets(evidenceTerms, 4).filter(isMeaningfulEvidence);
  const baseline = normalizeRiskRating(analyzeRiskLevel(documentContent).level);
  const residual = deescalateRiskRating(baseline);
  const evidencePool =
    snippets.length > 0
      ? snippets
      : [
          truncateEvidence(documentContent.replace(/\s+/g, " ").trim(), 200) ||
            "Information recorded in supporting documents.",
        ];

  const risks = evidencePool.slice(0, 3).map((snippet, index) => {
    const supportLabel = index === 0 ? "primary" : "additional";
    return {
      riskDefinition: toFirstPerson(`I have a ${supportLabel} ${category.toLowerCase()} risk identified in my records.`),
      initialRating: baseline,
      howItsARisk: toFirstPerson(
        `My documents note that ${snippet}. If this is not managed, my safety and wellbeing may be affected.`
      ),
      whoWillBeHarmed: "Service user and care workers",
      controlMeasures: toFirstPerson(
        sanitizeOutOfScopeText(
          "My care team follows my agreed care plan, records observations, uses the correct equipment and escalates any concerns promptly."
        )
      ),
      ratingAfterControls: residual,
    };
  });

  return {
    category,
    serviceUserInitials: normalizeInitials(serviceUserInitials || "N.N."),
    assessmentDate: formatRiskAssessmentDate(),
    risks,
    signedBy: normalizeSignedByName(performedBy || "Staff member"),
    jobTitle: performedByJobTitle || "Care Staff",
    additionalNotes: toFirstPerson("I need this risk area reviewed regularly and updated when my needs change."),
    generationMode: "rule-based",
  };
};

const buildRuleBasedCarePlanPayload = (params: {
  documentContent: string;
  serviceUserInitials?: string;
  callType?: string;
}) => {
  const { documentContent, serviceUserInitials, callType } = params;
  const callTypeLabel = callType || "General";
  const evidenceFinder = buildDocumentEvidenceFinder(documentContent);
  const callTypeTermMap: Record<string, string[]> = {
    Morning: ["wake", "morning", "breakfast", "wash", "dress", "medication"],
    Lunch: ["lunch", "meal", "hydration", "position", "medication"],
    Tea: ["tea", "snack", "hydration", "evening", "comfort"],
    Bed: ["night", "bed", "sleep", "evening medication", "toileting", "safe"],
    Domestic: ["clean", "laundry", "shopping", "household", "kitchen"],
    General: ["care", "support", "mobility", "medication", "nutrition", "safety"],
  };
  const terms = callTypeTermMap[callTypeLabel] || callTypeTermMap.General;
  const snippets = evidenceFinder.findAllSnippets(terms, 6).filter(isMeaningfulEvidence);
  const riskLevel = analyzeRiskLevel(documentContent).level;
  const safetySentence =
    riskLevel === "High"
      ? "I have high-risk needs and my carers must follow my documented safety controls at every visit."
      : riskLevel === "Medium"
      ? "I have moderate risks and need carers to follow my agreed routine consistently."
      : "My current risks are lower, but I still need my care plan followed each visit.";
  const evidenceText =
    snippets.length > 0
      ? snippets.map((snippet) => `- ${snippet}`).join(" ")
      : "- My supporting documents describe my daily care routines and risks.";

  let content = toFirstPerson(
    `This is my ${callTypeLabel.toLowerCase()} care plan. ${safetySentence} ` +
      `My carers should provide person-centred support, respect my preferences, protect my dignity and record each visit clearly. ` +
      `Key details from my documents include ${evidenceText} ` +
      `My care team should use the right equipment, check my comfort and escalate to senior staff or healthcare professionals when concerns appear. ` +
      `At the end of each visit, they should confirm I am safe, comfortable and have what I need before leaving.`
  );

  const minimumWords = 130;
  const currentWords = content.trim().split(/\s+/).length;
  if (currentWords < minimumWords) {
    content +=
      " I want consistent communication between carers, clear handovers and regular review of my care plan so support stays aligned with my current needs.";
  }

  return {
    serviceUserInitials: normalizeInitials(serviceUserInitials || "N.N."),
    generatedDate: new Date().toLocaleDateString("en-GB"),
    callType: callTypeLabel,
    content,
    generationMode: "rule-based",
  };
};

const buildRuleBasedPlanEnhancementPayload = (rawContent: string) => {
  const riskLevel = normalizeRiskRating(analyzeRiskLevel(rawContent).level);
  const profile = buildRuleBasedRiskAnalysisPayload(rawContent, false);
  const evidenceFinder = buildDocumentEvidenceFinder(rawContent);
  const extractedFields = extractCommonFields(rawContent);
  const lower = (rawContent || "").toLowerCase();
  
  // Use the richer extraction functions for more detailed data
  const personalCareData = extractPersonalCareNeeds(rawContent);
  const continenceData = extractContinenceInfo(rawContent);
  const nutritionData = extractNutritionInfo(rawContent);
  const environmentData = extractEnvironmentInfo(rawContent);
  const medicationData = extractMedicationInfo(rawContent);
  
  // Helper to find contextual snippets for specific topics
  const findContext = (terms: string[], max = 3) => evidenceFinder.findAllSnippets(terms, max);
  
  // Helper to check if content mentions any of the given terms
  const mentions = (terms: string[]) => terms.some(t => lower.includes(t.toLowerCase()));
  
  // Helper to build narrative from snippets or return default
  const buildNarrative = (terms: string[], fallback: string, max = 4) => {
    const snippets = findContext(terms, max);
    if (snippets.length > 0) {
      return toFirstPerson(snippets.join(". ") + ".");
    }
    return fallback;
  };

  const keyLifeSnippets = evidenceFinder.findAllSnippets(
    ["family", "preference", "routine", "support", "mobility", "medication", "nutrition", "safety"],
    6
  );
  const highlights = keyLifeSnippets.length
    ? keyLifeSnippets
    : ["My uploaded documents include current care information that should be reviewed with me and my representatives."];

  // Combine equipment from profile and environment extraction for comprehensive list
  const allEquipment = new Set([...profile.equipment, ...(environmentData.equipment || [])]);
  const equipmentRows = [...allEquipment].slice(0, 8).map((item: string) => ({
    name: item,
    fitForPurpose: "Yes",
    supplier: "To be confirmed",
    nextService: "To be confirmed",
  }));
  
  // If no equipment extracted but mobility support is needed, add common items
  if (equipmentRows.length === 0 && profile.careActivities.includes("Mobility and transfers")) {
    equipmentRows.push({
      name: "Mobility aid - to be confirmed at initial visit",
      fitForPurpose: "To be confirmed",
      supplier: "To be confirmed",
      nextService: "To be confirmed",
    });
  }

  const verificationQuestions: string[] = [];
  if (!profile.medicalConditions.length) verificationQuestions.push("Please confirm my diagnosed medical conditions and current treatment plan.");
  if (!profile.careActivities.length) verificationQuestions.push("Please confirm the exact daily care tasks and time-critical routines I need.");
  if (!profile.equipment.length) verificationQuestions.push("Please confirm what moving/handling or safety equipment is currently in place.");
  
  // Additional targeted verification questions based on what's missing
  const nameSnippets = findContext(["name", "born", "age", "date of birth"], 2);
  if (nameSnippets.length === 0) verificationQuestions.push("What is your full name and date of birth?");
  
  const familySnippets = findContext(["family", "wife", "husband", "daughter", "son", "children", "partner", "spouse", "next of kin"], 2);
  if (familySnippets.length === 0) verificationQuestions.push("Who are your family members or next of kin, and how often do they visit?");
  
  const hobbiesSnippets = findContext(["hobby", "hobbies", "interest", "enjoy", "like to", "favourite", "favorite", "music", "garden", "read", "television", "tv"], 3);
  if (hobbiesSnippets.length === 0) verificationQuestions.push("What are your hobbies, interests and things you enjoy doing?");
  
  const routineSnippets = findContext(["morning", "evening", "wake", "bed time", "bedtime", "routine", "schedule"], 3);
  if (routineSnippets.length === 0) verificationQuestions.push("What is your preferred daily routine - what time do you like to wake up, have meals, and go to bed?");
  
  const nutritionSnippets = findContext(["diet", "food", "meal", "eat", "drink", "allergy", "allergies", "vegetarian", "diabetic diet", "thickened", "nutrition"], 3);
  if (nutritionSnippets.length === 0) verificationQuestions.push("What are your food preferences, allergies, and dietary requirements?");
  
  if (!mentions(["key safe", "keysafe", "key box", "door entry"])) verificationQuestions.push("How do carers access your property? Is there a key safe, and if so where is it located?");
  if (!mentions(["smoke alarm", "fire alarm", "fire"])) verificationQuestions.push("Where are your smoke alarms and carbon monoxide detectors located? Are they working?");
  if (!mentions(["gp", "doctor", "surgery", "general practitioner"])) verificationQuestions.push("Who is your GP and which surgery are you registered with?");

  // Extract specific data for risk sections
  const hasDiabetes = mentions(["diabet", "insulin", "blood glucose", "metformin", "hypogly"]);
  const hasDementia = mentions(["dementia", "alzheimer", "cognitive impairment"]);
  const hasArthritis = mentions(["arthritis", "joint pain", "osteoarthritis", "rheumatoid"]);
  const hasRespiratory = mentions(["copd", "asthma", "breathless", "oxygen", "inhaler"]);
  const hasCardiac = mentions(["heart", "cardiac", "angina", "hypertension", "blood pressure"]);
  const hasMentalHealth = mentions(["depress", "anxiety", "mental health", "low mood"]);
  const hasEpilepsy = mentions(["epilep", "seizure"]);
  const hasFallsRisk = mentions(["fall", "unsteady", "balance", "trip"]);
  const hasSkinRisk = mentions(["pressure", "ulcer", "wound", "skin tear", "skin integrity"]);
  const hasIncontinence = mentions(["incontinence", "continence", "pad", "catheter"]);
  const hasHearingIssue = mentions(["hearing", "hearing aid", "deaf"]);
  const hasVisionIssue = mentions(["vision", "eyesight", "glasses", "blind", "cataract", "partially sighted"]);
  const hasSpeechIssue = mentions(["speech", "aphasia", "non-verbal", "communication difficulty"]);
  const hasSwallowIssue = mentions(["choking", "dysphagia", "aspiration", "thickened"]);
  const usesWheelchair = mentions(["wheelchair"]);
  const usesWalkingAid = mentions(["walking frame", "zimmer", "rollator", "walking stick", "crutch"]);
  const usesHoist = mentions(["hoist"]);
  const hasStairs = mentions(["stairs", "steps", "upstairs"]);
  const livesAlone = mentions(["lives alone", "live alone", "on my own", "by myself"]);
  const hasSmokeAlarm = mentions(["smoke alarm", "fire alarm"]);
  const hasKeySafe = mentions(["key safe", "keysafe", "key box"]);
  const smokes = mentions(["smok", "cigarette", "tobacco"]);

  // Build health overview narrative
  const conditionsList = profile.medicalConditions;
  const healthNarrative = conditionsList.length > 0
    ? toFirstPerson(`I have the following documented health conditions: ${conditionsList.join(", ")}. ` +
        (hasDiabetes ? "My diabetes requires careful dietary management and monitoring. " : "") +
        (hasArthritis ? "My arthritis affects my mobility and ability to carry out daily tasks. " : "") +
        (hasRespiratory ? "My respiratory condition affects my breathing and energy levels. " : "") +
        (hasCardiac ? "My heart condition requires monitoring and appropriate medication management. " : "") +
        (hasMentalHealth ? "My mental health needs are an important part of my overall care. " : "") +
        (hasEpilepsy ? "My epilepsy/seizures require careful monitoring and a clear emergency response plan. " : "") +
        "Care workers should be aware of these conditions and report any changes to the office.")
    : "My medical conditions have not been specified in the documents provided. Please confirm my diagnosed conditions and how they affect my daily life.";

  // Build medication narrative - use extracted medication data when available
  const medSnippets = findContext(["medication", "medicine", "tablet", "dosette", "blister pack", "prescription", "mg", "twice daily", "once daily", "three times"], 5);
  const extractedMedNames = medicationData.map(m => m.name).filter(Boolean);
  const medicationNarrative = extractedMedNames.length > 0
    ? toFirstPerson(`My current medications include: ${extractedMedNames.join(", ")}. ` +
        (medicationData.some(m => m.isControlled) ? "Some of my medications are controlled drugs and must be handled according to the controlled drug policy. " : "") +
        (medicationData.some(m => m.needsMonitoring) ? "Some of my medications require regular monitoring (e.g., blood tests). " : "") +
        (medSnippets.length > 0 ? medSnippets.slice(0, 2).join(". ") + ". " : "") +
        "Care workers should follow my MAR chart and report any missed or refused medications to the office immediately.")
    : medSnippets.length > 0
      ? toFirstPerson(`My medication details from the documents: ${medSnippets.join(". ")}. Care workers should follow my MAR chart and report any missed or refused medications to the office immediately.`)
      : profile.careActivities.includes("Medication support")
        ? "I require medication support. My specific medications, dosages and timings should be confirmed from my MAR chart and documented here."
        : "My medication requirements have not been specified in the documents provided. Please confirm whether I need medication support and provide details of my current medications.";

  // Build personal care narrative - use extracted personal care data
  const careSnippets = findContext(["wash", "bathing", "shower", "dressing", "toilet", "personal care", "morning routine", "evening routine", "teeth", "denture", "shave"], 5);
  const personalCareExtracted = Object.entries(personalCareData)
    .filter(([key, val]) => val && !key.includes("Level"))
    .map(([key, val]) => `${key}: ${val}`);
  const personalCareNarrative = careSnippets.length > 0
    ? toFirstPerson(`My personal care needs based on the documents: ${careSnippets.join(". ")}. ` +
        (personalCareExtracted.length > 0 ? `Specifically: ${personalCareExtracted.join(", ")}. ` : "") +
        (hasArthritis || usesWalkingAid ? "Due to my mobility limitations, I need extra time and support with tasks that involve bending, reaching or standing for long periods. " : "") +
        "My dignity and preferences should always be respected during personal care.")
    : personalCareExtracted.length > 0
      ? toFirstPerson(`My personal care needs include: ${personalCareExtracted.join(", ")}. My exact routines and preferences should be confirmed at my initial visit. My dignity and preferences should always be respected during personal care.`)
      : profile.careActivities.includes("Personal care support")
        ? "I require support with personal care. My specific routine, preferences and level of independence should be confirmed at my initial visit and documented here."
        : "My personal care needs have not been specified in the documents provided. Please confirm what support I need with washing, dressing and toileting.";

  // Build mobility narrative
  const mobilitySnippets = findContext(["mobility", "walking", "transfer", "hoist", "stand aid", "wheelchair", "frame", "stairs", "balance", "weight bearing"], 5);
  const mobilityNarrative = mobilitySnippets.length > 0
    ? toFirstPerson(`My mobility details from the documents: ${mobilitySnippets.join(". ")}. ` +
        (profile.equipment.length > 0 ? `I use the following equipment: ${profile.equipment.join(", ")}. ` : "") +
        "Care workers should follow my moving and handling plan and never rush me during transfers.")
    : profile.careActivities.includes("Mobility and transfers")
      ? `I require mobility and transfer support. ${profile.equipment.length > 0 ? `I currently use: ${profile.equipment.join(", ")}. ` : ""}My specific moving and handling requirements should be confirmed and documented here.`
      : "My mobility needs have not been specified in the documents provided. Please confirm my mobility level and any equipment I use.";

  // Build nutrition narrative - use extracted nutrition data
  const nutritionExtracted: string[] = [];
  if (nutritionData.feedingMethod) nutritionExtracted.push(`Feeding method: ${nutritionData.feedingMethod}`);
  if (nutritionData.allergies) nutritionExtracted.push(`Allergies: ${nutritionData.allergies}`);
  if (nutritionData.modified) nutritionExtracted.push(`Diet modification: ${nutritionData.modified}`);
  if (nutritionData.fluids) nutritionExtracted.push(`Fluids: ${nutritionData.fluids}`);
  if (nutritionData.mustScore) nutritionExtracted.push(`MUST score: ${nutritionData.mustScore}`);
  
  const nutritionNarrative = nutritionSnippets.length > 0 || nutritionExtracted.length > 0
    ? toFirstPerson(
        (nutritionSnippets.length > 0 ? `My nutritional needs from the documents: ${nutritionSnippets.join(". ")}. ` : "") +
        (nutritionExtracted.length > 0 ? `Key nutrition information: ${nutritionExtracted.join(". ")}. ` : "") +
        (hasDiabetes ? "Due to my diabetes, I need to follow a diabetic-friendly diet and avoid excessive sugar. " : "") +
        (hasSwallowIssue ? "I have swallowing difficulties and may require modified texture food or thickened fluids. " : "") +
        "My food preferences and any allergies should be clearly documented.")
    : "My dietary requirements, preferences and allergies have not been specified in the documents provided. Please confirm my nutritional needs.";

  // Determine categorical fields from evidence - prefer extractedFields from ruleBasedEngine, fall back to keyword detection
  const speechStatus = extractedFields.speech || (hasSpeechIssue ? "Impaired" : (findContext(["speech", "speak", "talk", "verbal"], 1).length > 0 ? "Good" : "Not assessed - to be confirmed at initial visit"));
  const hearingStatus = extractedFields.hearing || (hasHearingIssue ? "Impaired/Uses aids" : (findContext(["hearing", "hears well"], 1).length > 0 ? "Good" : "Not assessed - to be confirmed at initial visit"));
  const eyesightStatus = extractedFields.eyesight || (hasVisionIssue ? "Impaired/Uses glasses" : (findContext(["eyesight", "vision", "sees well"], 1).length > 0 ? "Good" : "Not assessed - to be confirmed at initial visit"));
  const breathlessnessStatus = extractedFields.breathlessness || (hasRespiratory ? "Moderate" : "Not assessed - to be confirmed at initial visit");
  const urinaryStatus = extractedFields.urinaryIncontinence || (hasIncontinence ? "Occasional" : "Not specified in documents provided");
  const faecalStatus = extractedFields.faecalIncontinence || (hasIncontinence && mentions(["faecal", "bowel incontinence", "soiling"]) ? "Occasional" : "Not specified in documents provided");
  const memoryStatus = extractedFields.memory || (hasDementia ? "Poor" : "Not assessed - to be confirmed at initial visit");
  const moodStatus = extractedFields.moods || (hasMentalHealth ? "Variable" : "Not assessed - to be confirmed at initial visit");
  const orientationStatus = extractedFields.orientation || (hasDementia ? "Confused at times" : "Not assessed - to be confirmed at initial visit");
  const sleepStatus = extractedFields.sleepPattern || "Not assessed - to be confirmed at initial visit";
  const mobilityWalking = extractedFields.mobility || (usesWalkingAid ? "With aid" : (usesWheelchair ? "Unable" : "Not assessed - to be confirmed at initial visit"));
  const behavioursStatus = extractedFields.behaviours || (hasDementia || mentions(["behaviour", "agitation", "aggression", "wandering"]) ? "Occasional" : "No concerns documented");

  // Determine weight bearing from mobility evidence
  const weightBearing = extractedFields.weightBearing || (usesHoist ? "None" : (usesWalkingAid ? "Partial" : (usesWheelchair ? "None" : "Not assessed - to be confirmed at initial visit")));
  
  // Additional fields from extractedFields
  const stairsStatus = extractedFields.stairs || (hasStairs ? (usesWalkingAid || usesWheelchair ? "With support" : "Not specified - to be confirmed") : "Not applicable - no stairs documented");
  const sitToStandStatus = extractedFields.sitToStand || ((usesWalkingAid || usesHoist || hasArthritis) ? "Needs help" : "Not assessed - to be confirmed at initial visit");
  const washingStatus = extractedFields.washing || (profile.careActivities.includes("Personal care support") ? "Needs assistance" : "Not assessed - to be confirmed at initial visit");
  const dressingStatus = extractedFields.dressing || (profile.careActivities.includes("Personal care support") ? "Needs help" : "Not assessed - to be confirmed at initial visit");
  const canBeLeftAloneStatus = extractedFields.canBeLeftAlone || (livesAlone ? "Yes - lives alone" : (hasDementia ? "No - to be confirmed, cognitive impairment documented" : "To be confirmed at initial visit"));
  const proneToFallsStatus = extractedFields.proneToFalls || (hasFallsRisk ? "Yes" : "Not specified in documents provided - assess at initial visit");
  const propertyTypeStatus = extractedFields.propertyType || "Not specified - confirm property type at initial visit";
  const meansOfAccessStatus = extractedFields.meansOfAccess || (hasKeySafe ? "Key safe" : "Not specified in documents provided - confirm access arrangements");
  const smokingStatusField = extractedFields.smokingStatus || (smokes ? "Smoker" : "Not specified");

  return {
    verificationQuestions,
    thisIsMe: {
      whoAmI: toFirstPerson(`My name is [Name]. ${nameSnippets.length > 0 ? nameSnippets.join(". ") + ". " : ""}` +
        (familySnippets.length > 0 ? familySnippets.join(". ") + ". " : "") +
        `${highlights[0]} ` +
        "I want my carers to understand my background, my preferences and what matters most to me. " +
        "The details of my life story should be discussed with me and my family to ensure this section reflects who I am as a person."),
      hobbiesInterests: toFirstPerson(
        hobbiesSnippets.length > 0
          ? `My interests and hobbies include: ${hobbiesSnippets.join(". ")}. My carers should try to incorporate these into my daily routine where possible.`
          : `My hobbies and interests have not been specified in the documents provided. My carers should ask me about what I enjoy and record my preferences here. ${highlights.slice(1, 3).join(" ") || ""}`
      ),
      whatMakesGoodDay: toFirstPerson(
        routineSnippets.length > 0
          ? `A good day for me includes: ${routineSnippets.join(". ")}. It is important that my routine is followed and that carers are patient and respectful. ${highlights.slice(3, 5).join(" ")}`
          : `A good day for me is when care is on time, respectful and consistent with my routines. My specific preferences for what makes a good day should be discussed with me and recorded here. ${highlights.slice(3, 5).join(" ")}`
      ),
    },
    goalSetting: {
      goals: [
        {
          goal: "Maintain safety and stability at home",
          howToAchieve: "Follow documented routines, complete safety checks and escalate early if my condition changes.",
          potentialBarriers: "Changes in mobility, health fluctuations or missed communication between visits.",
          timeFrame: "Review at each care plan update",
        },
        ...(hasFallsRisk ? [{
          goal: "Reduce risk of falls",
          howToAchieve: "Use prescribed mobility aids, keep pathways clear and follow moving and handling guidance.",
          potentialBarriers: "Rushing, not using aids, environmental hazards or changes in health.",
          timeFrame: "Ongoing - review every 3 months",
        }] : []),
        ...(hasDiabetes ? [{
          goal: "Maintain stable blood sugar levels",
          howToAchieve: "Follow dietary guidance, take medication as prescribed and report symptoms of high or low blood sugar.",
          potentialBarriers: "Dietary changes, missed medication or illness.",
          timeFrame: "Ongoing - review every 3 months",
        }] : []),
      ],
      internetSupport: "Not specified in documents provided - to be confirmed at initial visit.",
      assistiveTechnology: profile.equipment.length > 0 ? `Current equipment includes ${profile.equipment.join(", ")}.` : "Not specified in documents provided - to be confirmed at initial visit.",
    },
    advanceDecisions: {
      advanceDecisionInPlace: findContext(["advance decision", "advance directive", "living will"], 1).length > 0 ? "Yes - see details" : "Not specified in documents provided",
      dnrDetails: findContext(["dnr", "dnacpr", "do not resuscitate", "do not attempt"], 1).length > 0 
        ? buildNarrative(["dnr", "dnacpr", "do not resuscitate"], "DNACPR details to be confirmed from authorised documentation.")
        : "Not specified in documents provided - confirm whether any DNACPR or advance decision is in place.",
      lastingPOA: findContext(["power of attorney", "poa", "lasting power"], 1).length > 0 ? "Yes" : "Not specified in documents provided",
      poaType: findContext(["health and welfare", "property and finance", "both poa"], 1).length > 0
        ? buildNarrative(["health and welfare", "property and finance"], "To be confirmed")
        : "Not specified in documents provided",
      poaContact: buildNarrative(["power of attorney", "poa contact", "attorney"], "Not specified in documents provided - record authorised contact details."),
    },
    myCarePlan: {
      capacityAndSafeguarding: buildNarrative(
        ["capacity", "mental capacity", "safeguarding", "best interest", "decision making", "consent"],
        hasDementia 
          ? "I have a cognitive impairment documented in my records. My mental capacity should be assessed for specific decisions and any safeguarding concerns should be escalated to the office immediately. A formal capacity assessment should be completed and documented here."
          : "My mental capacity and safeguarding status should be assessed and documented here. I should be assumed to have capacity unless a formal assessment indicates otherwise. Any safeguarding concerns should be reported to the office immediately."
      ),
      healthAndWellbeing: healthNarrative,
      triggerPoints: toFirstPerson(
        "Signs that my health may be changing and should be reported to the office include: " +
        (hasDiabetes ? "signs of high or low blood sugar (shaking, sweating, confusion, excessive thirst), " : "") +
        (hasRespiratory ? "increased breathlessness or difficulty breathing, " : "") +
        (hasCardiac ? "chest pain, unusual swelling in legs/ankles, sudden breathlessness, " : "") +
        (hasEpilepsy ? "seizure activity or unusual symptoms before a seizure, " : "") +
        (hasMentalHealth ? "significant changes in mood, withdrawal or signs of distress, " : "") +
        "any new pain or discomfort, reduced food or fluid intake, changes in skin condition, increased falls or unsteadiness, " +
        "new confusion or disorientation, signs of infection (fever, redness, swelling). " +
        "If in any doubt, contact the office. In an emergency, call 999."
      ),
      medicationRequirements: medicationNarrative,
      nutrition: nutritionNarrative,
      personalCareNeeds: personalCareNarrative,
      mobilityAndEquipment: mobilityNarrative,
      houseworkAndSocial: buildNarrative(
        ["housework", "cleaning", "laundry", "shopping", "social", "activities", "visitors", "isolation", "loneliness"],
        livesAlone
          ? "I live alone. My housework, shopping and social needs should be confirmed and documented here. Living alone may increase my risk of social isolation - my carers should be aware of this and encourage social interaction."
          : "My housework support needs and social activities have not been specified in the documents provided. Please confirm what domestic support I need and any social activities that are important to me."
      ),
      financialArrangements: buildNarrative(
        ["finance", "financial", "money", "pension", "benefit", "bank"],
        "My financial arrangements have not been specified in the documents provided. Any relevant support boundaries and safeguarding controls should be documented here."
      ),
    },
    riskSection1Health: {
      speech: speechStatus,
      speechDetails: hasSpeechIssue
        ? buildNarrative(["speech", "aphasia", "communication", "non-verbal"], "Speech difficulties documented - details to be confirmed at initial visit.")
        : "Not specified in documents provided - to be confirmed at initial visit.",
      hearing: hearingStatus,
      hearingDetails: hasHearingIssue
        ? buildNarrative(["hearing", "hearing aid", "deaf"], "Hearing difficulties documented - details to be confirmed at initial visit.")
        : "Not specified in documents provided - to be confirmed at initial visit.",
      eyesight: eyesightStatus,
      eyesightDetails: hasVisionIssue
        ? buildNarrative(["vision", "eyesight", "glasses", "cataract", "blind"], "Vision difficulties documented - details to be confirmed at initial visit.")
        : "Not specified in documents provided - to be confirmed at initial visit.",
      breathlessness: breathlessnessStatus,
      breathlessnessDetails: hasRespiratory
        ? buildNarrative(["breathless", "copd", "asthma", "oxygen", "inhaler"], "Respiratory condition documented - breathing difficulties to be assessed in detail at initial visit.")
        : "Not specified in documents provided.",
      urinaryIncontinence: urinaryStatus,
      urinaryDetails: continenceData.bladder 
        ? toFirstPerson(`My bladder continence: ${continenceData.bladder}. ` + (continenceData.bladderRisk === "High" ? "This requires careful management and monitoring." : "Care workers should be aware and support my dignity."))
        : hasIncontinence
          ? buildNarrative(["urinary", "incontinence", "continence", "pad", "catheter", "toilet"], "Continence needs documented - specific details to be confirmed at initial visit.")
          : "Not specified in documents provided.",
      faecalIncontinence: faecalStatus,
      faecalDetails: continenceData.bowel
        ? toFirstPerson(`My bowel continence: ${continenceData.bowel}. ` + (continenceData.bowelRisk === "High" ? "This requires careful management and monitoring." : "Care workers should be aware and provide appropriate support."))
        : hasIncontinence && mentions(["faecal", "bowel"])
          ? buildNarrative(["faecal", "bowel", "soiling"], "Bowel continence needs documented - details to be confirmed.")
          : "Not specified in documents provided.",
      memory: memoryStatus,
      moods: moodStatus,
      orientation: orientationStatus,
      sleepPattern: sleepStatus,
      behaviours: behavioursStatus,
      understandsInfo: hasDementia ? "Partially" : "Assumed Yes - to be confirmed",
      retainsInfo: hasDementia ? "Partially" : "Assumed Yes - to be confirmed",
      weighsDecision: hasDementia ? "Partially" : "Assumed Yes - to be confirmed",
      communicatesDecision: hasDementia ? "Partially" : (hasSpeechIssue ? "Partially" : "Assumed Yes - to be confirmed"),
      capacityDetails: buildNarrative(
        ["capacity", "mental capacity", "decision", "consent"],
        hasDementia
          ? "Cognitive impairment identified in documents. A formal mental capacity assessment should be completed for significant decisions. Day-to-day capacity should be assessed on a decision-specific basis."
          : "Assumed to have full capacity. No concerns documented. To be confirmed at initial visit."
      ),
      riskLevel,
      riskPrevention: toFirstPerson(
        "My health risks are managed by: " +
        (conditionsList.length > 0 ? `monitoring my documented conditions (${conditionsList.slice(0, 3).join(", ")}), ` : "") +
        "observing for changes and reporting to the office, following my care plan and medication guidance, " +
        "and escalating to GP or 999 in an emergency."
      ),
    },
    riskSection2Medication: {
      prescriptionOrdering: buildNarrative(["prescription", "ordering", "pharmacy", "chemist", "dispensing"], "Not specified in documents provided - to be confirmed."),
      dosageSystem: medicationData.some(m => m.storage === "blister") ? "Blister pack" 
        : medicationData.some(m => m.storage === "dosette") ? "Dosette box"
        : mentions(["blister pack", "blister"]) ? "Blister pack" 
        : (mentions(["dosette"]) ? "Dosette box" 
        : (mentions(["original packaging"]) ? "Original packaging" 
        : "Not specified in documents provided")),
      systemMaintainer: buildNarrative(["pharmacy", "chemist", "dispensing"], "Not specified in documents provided - to be confirmed."),
      medicationStorage: buildNarrative(["medication storage", "medicines kept", "stored"], "Not specified in documents provided - to be confirmed at initial visit."),
      currentInvestigations: buildNarrative(["investigation", "hospital", "referral", "appointment", "specialist", "consultant"], "No current investigations documented."),
      surplusMedication: "Not specified in documents provided",
      medicationConcerns: nutritionData.allergies && nutritionData.allergies !== "NKDA - No known drug allergies"
        ? `Drug allergies documented: ${nutritionData.allergies}. Ensure no contraindicated medications are given.`
        : buildNarrative(["medication concern", "side effect", "adverse", "reaction", "allergy"], "No medication concerns documented."),
      homeopathicMeds: buildNarrative(["herbal", "homeopathic", "over the counter", "otc", "supplement"], "Not specified in documents provided."),
      prnMedication: mentions(["prn", "as required", "when needed", "pain relief"]) ? "Yes - see details" : "Not specified in documents provided",
      covertMedication: mentions(["covert"]) ? "Yes - follow covert medication protocol" : "No",
      pickingUpTablets: hasArthritis ? "Yes - difficulty due to arthritis affecting hands" : "Not specified",
      openingBoxes: hasArthritis ? "Yes - difficulty due to arthritis affecting hands" : "Not specified",
      pouringLiquids: hasArthritis ? "Yes - possible difficulty" : "Not specified",
      usingDosageSystem: hasDementia ? "Yes - may need prompting due to cognitive impairment" : "Not specified",
      applyingCreams: (hasArthritis || usesWalkingAid) ? "Yes - difficulty reaching some areas" : "Not specified",
      swallowingTablets: hasSwallowIssue ? "Yes - swallowing difficulties documented" : "Not specified",
      understandingInstructions: hasDementia ? "Yes - may need repeated, simple instructions" : "Not specified",
      managingInhalers: hasRespiratory ? "To be confirmed - assess inhaler technique" : "Not applicable",
      instillingDrops: hasVisionIssue ? "To be confirmed - may have difficulty with eye drops" : "Not specified",
      controlledDrugs: medicationData.some(m => m.isControlled)
        ? `Controlled drugs in use: ${medicationData.filter(m => m.isControlled).map(m => m.name || "unknown").join(", ")}. Follow controlled drug policy for storage, administration and recording.`
        : buildNarrative(["controlled drug", "cd", "morphine", "oxycodone", "fentanyl"], "No controlled drugs documented."),
      warfarin: medicationData.some(m => m.name?.includes("warfarin"))
        ? "Warfarin in use - INR monitoring required. Follow anticoagulant protocol."
        : mentions(["warfarin"]) ? buildNarrative(["warfarin", "inr", "anticoagulant"], "Warfarin documented - INR monitoring required.") : "Not applicable",
      skinIntegrity: hasSkinRisk || hasDiabetes ? "Yes - at risk" : "Not specified in documents provided",
      skinDetails: (hasSkinRisk || hasDiabetes)
        ? buildNarrative(["skin", "pressure", "wound", "ulcer", "integrity"], 
            hasDiabetes ? "At risk of skin breakdown due to diabetes. Feet and lower legs should be checked for any skin changes. Any concerns should be reported to the district nurse."
            : "Skin integrity risk documented. Any skin changes, redness or breakdown should be reported to the district nurse immediately.")
        : "No skin integrity concerns documented.",
      riskLevel,
      riskPrevention: "Follow MAR chart precisely. Report missed, refused or late medications to the office immediately. Check for side effects and any medication changes. Ensure medication is stored safely.",
    },
    riskSection3Nutrition: {
      mealAssistance: profile.careActivities.includes("Nutrition and hydration support") ? "Yes" : "Not specified in documents provided",
      normalDiet: nutritionData.feedingMethod || (hasDiabetes ? "Diabetic diet" : (hasSwallowIssue ? "Modified texture - to be confirmed" : "Normal diet - confirm preferences at initial visit")),
      specialDietary: nutritionData.modified || buildNarrative(["dietary", "diabetic diet", "low salt", "low sugar", "renal diet", "gluten free", "halal", "kosher"], hasDiabetes ? "Diabetic diet - low sugar" : "Not specified in documents provided."),
      foodAllergies: nutritionData.allergies || buildNarrative(["allergy", "allergic", "intolerance", "anaphylaxis"], "No allergies documented - to be confirmed at initial visit."),
      softDiet: nutritionData.modified?.includes("texture") ? "Yes - modified texture diet" : (hasSwallowIssue ? "Yes - due to swallowing difficulties" : "No"),
      foodIntolerances: buildNarrative(["intolerance", "lactose", "gluten", "coeliac"], "Not specified in documents provided."),
      tubeFeed: nutritionData.feedingMethod?.includes("PEG") ? "Yes - PEG feeding in place" : (mentions(["peg", "tube feed", "enteral"]) ? "Yes - follow enteral feeding protocol" : "No"),
      supplementaryFoods: nutritionData.fluids || buildNarrative(["thickener", "supplement", "fortisip", "ensure", "complan"], hasSwallowIssue ? "Thickened fluids may be required - confirm with SALT team." : "Not specified in documents provided."),
      foodLikes: buildNarrative(["likes to eat", "enjoys", "favourite food", "prefers"], "Not specified in documents provided - ask me about my food preferences."),
      foodDislikes: buildNarrative(["dislikes", "does not eat", "avoid", "won't eat"], "Not specified in documents provided - ask me about foods I do not like."),
      portionSize: "Not specified in documents provided - to be confirmed.",
      mainMealTime: buildNarrative(["meal time", "dinner time", "lunch time", "breakfast"], "Not specified in documents provided - ask about my preferred meal times."),
      fluidIntake: buildNarrative(["fluid", "drink", "water", "tea", "coffee", "hydration"], "Not specified in documents provided - encourage regular fluid intake and record preferences."),
      riskLevel,
      riskPrevention: toFirstPerson(
        "My nutritional risks are managed by: " +
        (hasDiabetes ? "following my diabetic diet plan, " : "") +
        (hasSwallowIssue ? "following SALT recommendations for modified texture food/fluids, " : "") +
        "monitoring my food and fluid intake, reporting any significant changes in appetite or weight, " +
        "and ensuring my preferences and allergies are clearly documented."
      ),
    },
    riskSection4Equipment: {
      equipment: equipmentRows.length > 0 ? equipmentRows : [{
        name: "No equipment documented - to be confirmed at initial visit",
        fitForPurpose: "N/A",
        supplier: "N/A",
        nextService: "N/A",
      }],
      remedialAction: "All equipment should be checked before each use. Any faults or concerns should be reported to the office immediately and the equipment should not be used until it has been inspected.",
      riskLevel,
      riskPrevention: "Use only approved equipment. Follow moving and handling guidance. Report any equipment faults immediately. Ensure servicing is up to date.",
    },
    riskSection5Mobility: {
      weightBearing: weightBearing,
      weightBearingDetails: buildNarrative(["weight bearing", "weight bear", "non weight"], "Not specified in documents provided - to be confirmed at initial visit."),
      walking: mobilityWalking,
      walkingDetails: buildNarrative(["walking", "walks", "ambulate", "mobilise"], "Not specified - to be confirmed at initial visit."),
      stairs: stairsStatus,
      stairsDetails: hasStairs
        ? buildNarrative(["stairs", "steps", "stairlift"], "Stairs present in property - ability to manage stairs to be confirmed at initial visit.")
        : "No stairs documented in property.",
      sitToStand: sitToStandStatus,
      sitToStandDetails: buildNarrative(["sit to stand", "standing", "getting up", "transfer from chair"], "Not specified - to be confirmed at initial visit."),
      washing: washingStatus,
      washingDetails: buildNarrative(["wash", "bathing", "shower", "sink wash", "strip wash"], "Not specified - to be confirmed at initial visit."),
      dressing: dressingStatus,
      dressingDetails: buildNarrative(["dress", "clothing", "undress", "get dressed"], "Not specified - to be confirmed at initial visit."),
      oralCare: "Not assessed - to be confirmed at initial visit",
      oralCareDetails: buildNarrative(["teeth", "dental", "denture", "oral care", "mouth care"], "Not specified - to be confirmed at initial visit."),
      bathShower: buildNarrative(["bath", "shower", "strip wash", "bath board", "shower chair"], "Preference not specified - to be confirmed at initial visit."),
      toiletCommode: buildNarrative(["toilet", "commode", "toileting", "bathroom"], hasIncontinence ? "Continence support documented - toilet/commode needs to be confirmed." : "Not specified - to be confirmed at initial visit."),
      wheelchair: usesWheelchair ? "Yes - wheelchair in use" : "No wheelchair documented",
      transfers: buildNarrative(["transfer", "hoist", "stand aid", "slide sheet", "banana board"], usesHoist ? "Hoist transfers documented. Follow moving and handling care plan." : "Transfer method to be confirmed at initial visit."),
      moveInBed: buildNarrative(["bed mobility", "repositioning", "turning", "move in bed"], "Not specified - to be confirmed at initial visit."),
      inOutOfBed: buildNarrative(["get into bed", "get out of bed", "bed transfer", "profiling bed"], "Not specified - to be confirmed at initial visit."),
      canBeLeftAlone: canBeLeftAloneStatus,
      proneToFalls: proneToFallsStatus,
      riskLevel,
      riskPrevention: toFirstPerson(
        "My mobility risks are managed by: " +
        (usesWalkingAid ? "using my walking aid at all times, " : "") +
        (usesHoist ? "using the hoist for transfers with two carers, " : "") +
        (hasFallsRisk ? "following my falls prevention plan, " : "") +
        "keeping pathways clear, ensuring good lighting, allowing me time to move at my own pace, " +
        "and reporting any falls or near-misses to the office."
      ),
    },
    riskSection6Appliances: {
      cooker: "Not assessed - to be confirmed at initial visit",
      microwave: "Not assessed - to be confirmed at initial visit",
      iron: "Not assessed - to be confirmed at initial visit",
      kettle: "Not assessed - to be confirmed at initial visit",
      toaster: "Not assessed - to be confirmed at initial visit",
      tumbleDryer: "Not assessed - to be confirmed at initial visit",
      floorCoverings: buildNarrative(["carpet", "rug", "floor", "trip hazard", "uneven"], "Not assessed - check for trip hazards at initial visit."),
      handRails: hasStairs ? "Check presence and condition at initial visit" : "Not specified",
      electricBlanket: "Not assessed - to be confirmed at initial visit",
      bed: buildNarrative(["bed", "profiling bed", "hospital bed", "mattress"], "Not assessed - to be confirmed at initial visit."),
      washingMachine: "Not assessed - to be confirmed at initial visit",
      centralHeating: "Not assessed - to be confirmed at initial visit",
      actionsRequired: "All appliances should be visually checked during the first visit. Any hazards should be reported to the office. " +
        (hasDementia ? "Due to cognitive impairment, extra attention should be paid to safe use of cooker and other heat-producing appliances." : ""),
    },
    riskSection7Fire: {
      atRisk: (hasDementia || smokes || mentions(["oxygen"]) || environmentData.smoker) ? "Yes" : "To be confirmed at initial visit",
      riskReason: hasDementia ? "Cognitive impairment may affect ability to respond to fire alarm"
        : (smokes || environmentData.smoker) ? "Smoking materials present fire risk"
        : mentions(["oxygen"]) ? "Oxygen in use increases fire risk"
        : "To be assessed at initial visit",
      ragRating: (hasDementia || smokes || mentions(["oxygen"]) || environmentData.smoker) ? "Amber" : "To be confirmed",
      plugSockets: "Not assessed - check for overloaded sockets at initial visit",
      electricCables: "Not assessed - check for trailing cables at initial visit",
      smokingPolicy: smokingStatusField === "Smoker" ? "Smoking policy must be explained and documented" : "Not applicable - non-smoker or not specified",
      smokeAlarmLocation: environmentData.smokeAlarm 
        ? `Smoke alarm present (${environmentData.smokeAlarm}). Confirm location and test at initial visit.`
        : hasSmokeAlarm ? buildNarrative(["smoke alarm", "fire alarm"], "Location documented - confirm working at initial visit.") : "Not specified - confirm location and test at initial visit",
      smokeAlarmWorking: environmentData.smokeAlarm === "Safe" ? "Yes - confirmed" : "To be confirmed at initial visit",
      coDetectorLocation: buildNarrative(["co detector", "carbon monoxide", "co alarm"], "Not specified - confirm if CO detector is present."),
      coDetectorWorking: "To be confirmed at initial visit",
      canEvacuate: (usesWheelchair || usesHoist) ? "No - will need assistance to evacuate"
        : (usesWalkingAid || hasArthritis) ? "May need assistance - mobility limitations"
        : "To be confirmed at initial visit",
      actionsAndSafety: toFirstPerson(
        "Fire safety measures for my property: " +
        "Smoke alarms should be tested and confirmed working. " +
        (smokes ? "I should not smoke when oxygen is in use or when alone if there are concerns about safe smoking. " : "") +
        (hasDementia ? "Due to my cognitive impairment, extra checks should be made on appliances and heat sources. " : "") +
        "An evacuation plan should be documented, including how I would exit the property in an emergency. " +
        "Care workers should know the location of smoke alarms, fire exits and fire blanket/extinguisher if present."
      ),
    },
    riskSection8COSHH: {
      cleaningStorage: "Not specified in documents provided - confirm where cleaning materials are stored at initial visit. They should be stored safely and out of reach if there are any concerns.",
      riddorExplained: "To be confirmed at initial visit",
    },
    riskSection9External: {
      access: buildNarrative(["access", "entrance", "front door", "pathway", "drive", "garden"], "Property access details to be confirmed at initial visit."),
      clearPathways: mentions(["clear path", "pathway"]) ? "Yes" : "To be confirmed at initial visit",
      handrails: hasStairs ? "Check for external handrails at initial visit" : "Not specified",
      entranceSteps: buildNarrative(["steps", "step", "ramp", "level access"], "To be confirmed at initial visit."),
      lighting: buildNarrative(["lighting", "external light", "porch light", "sensor light"], "Not specified - check external lighting at initial visit."),
      ramps: buildNarrative(["ramp"], "No ramps documented."),
      personalSecurity: buildNarrative(["security", "alarm", "cctv", "chain"], livesAlone ? "Lives alone - personal security should be reviewed at initial visit." : "Not specified."),
      parking: buildNarrative(["parking", "driveway", "car park"], "Not specified - confirm parking arrangements for carers."),
      actionsRequired: "External access and safety should be fully assessed at the initial visit. Report any hazards to the office.",
      riskLevel,
      riskPrevention: "Ensure pathways are clear and well-lit. Report any external hazards. Take care in wet or icy conditions.",
    },
    riskSection10Security: {
      meansOfAccess: meansOfAccessStatus,
      propertyType: propertyTypeStatus,
      enterUsing: environmentData.access === "Ring/knock" 
        ? "Ring doorbell / knock"
        : buildNarrative(["front door", "side door", "back door"], "Not specified - confirm entry point at initial visit."),
      keysafeConsent: meansOfAccessStatus.includes("Key safe") ? "Yes" : "To be confirmed",
      gasShutOff: "Not specified - confirm and document location at initial visit",
      stopTap: "Not specified - confirm and document location at initial visit",
      fuseBox: "Not specified - confirm and document location at initial visit",
      riskLevel,
      riskPrevention: "Ensure property is secured when leaving. Document locations of gas shut-off, stop tap and fuse box. Report any security concerns to the office.",
    },
    section11Bands: {
      personalCare: profile.careActivities.includes("Personal care support") ? "Yes" : "No",
      mentalHealth: profile.medicalConditions.some((item) => /mental/i.test(item)) || hasMentalHealth ? "Yes" : "No",
      physicalDisability: profile.careActivities.includes("Mobility and transfers") || hasArthritis ? "Yes" : "No",
      dementia: hasDementia ? "Yes" : "No",
      eatingDisorder: mentions(["eating disorder", "anorexia", "bulimia"]) ? "Yes" : "No",
      sensoryImpairment: hasHearingIssue || hasVisionIssue ? "Yes" : "No",
      detainedMHA: mentions(["section", "detained", "mental health act"]) ? "Yes" : "No",
      drugAlcoholMisuse: mentions(["alcohol", "drug misuse", "substance misuse", "addiction"]) ? "Yes" : "No",
      learningDifficulties: mentions(["learning difficult", "learning disabilit", "intellectual disabilit"]) ? "Yes" : "No",
    },
    generationMode: "rule-based",
  };
};

// Drug interaction type definition
interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'high' | 'moderate' | 'low';
  description: string;
}

const drugInteractionCache = new Map<string, DrugInteraction[]>();

function getDrugInteractionCacheKey(medications: Array<{ name: string; genericName?: string }>): string {
  // Create deterministic key from sorted medication names
  const medNames = medications
    .map(m => (m.genericName ? `${m.name.toLowerCase()}|${m.genericName.toLowerCase()}` : m.name.toLowerCase()))
    .sort()
    .join('::');
  return medNames;
}

const buildDrugTokenString = (value: string): string =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDrugKeyword = (value: string): string => buildDrugTokenString(value);

const detectRuleBasedInteractions = (
  medications: Array<{ name: string; genericName?: string }>
): DrugInteraction[] => {
  if (medications.length < 2) return [];

  const meds = medications.map((m) => {
    const name = m.name || "";
    const genericName = m.genericName || "";
    const tokens = buildDrugTokenString(`${name} ${genericName}`);
    return { name, genericName, tokens };
  });

  const matchMeds = (keywords: string[]) => {
    const normalized = keywords.map(normalizeDrugKeyword);
    return meds.filter((m) => normalized.some((kw) => kw && m.tokens.includes(kw)));
  };

  const interactions: DrugInteraction[] = [];
  const seen = new Set<string>();
  const pushInteraction = (
    drug1: string,
    drug2: string,
    severity: DrugInteraction["severity"],
    description: string
  ) => {
    if (!drug1 || !drug2) return;
    if (drug1.toLowerCase() === drug2.toLowerCase()) return;
    const key = [drug1.toLowerCase(), drug2.toLowerCase()].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    interactions.push({ drug1, drug2, severity, description });
  };

  const bloodThinners = matchMeds([
    "warfarin",
    "apixaban",
    "rivaroxaban",
    "dabigatran",
    "edoxaban",
    "heparin",
    "enoxaparin",
    "dalteparin",
    "tinzaparin",
    "clopidogrel",
    "ticagrelor",
  ]);
  const nsaids = matchMeds([
    "ibuprofen",
    "naproxen",
    "diclofenac",
    "ketoprofen",
    "indomethacin",
    "mefenamic",
    "celecoxib",
    "etoricoxib",
    "meloxicam",
    "piroxicam",
    "ketorolac",
    "aspirin",
    "nurofen",
  ]);
  const opioids = matchMeds([
    "morphine",
    "oxycodone",
    "fentanyl",
    "buprenorphine",
    "codeine",
    "dihydrocodeine",
    "tramadol",
    "hydromorphone",
    "methadone",
    "diamorphine",
    "tapentadol",
    "oxynorm",
    "oxycontin",
    "oromorph",
  ]);
  const sedatives = matchMeds([
    "diazepam",
    "lorazepam",
    "temazepam",
    "clonazepam",
    "alprazolam",
    "midazolam",
    "nitrazepam",
    "chlordiazepoxide",
    "oxazepam",
    "zopiclone",
    "zolpidem",
  ]);
  const aceInhibitors = matchMeds([
    "ramipril",
    "lisinopril",
    "enalapril",
    "captopril",
    "perindopril",
    "quinapril",
    "benazepril",
    "fosinopril",
    "trandolapril",
  ]);
  const potassiumSparing = matchMeds([
    "spironolactone",
    "eplerenone",
    "amiloride",
    "triamterene",
  ]);
  const methotrexate = matchMeds(["methotrexate"]);
  const ssris = matchMeds([
    "sertraline",
    "citalopram",
    "escitalopram",
    "fluoxetine",
    "paroxetine",
    "fluvoxamine",
  ]);
  const maois = matchMeds([
    "phenelzine",
    "isocarboxazid",
    "tranylcypromine",
    "moclobemide",
    "selegiline",
    "linezolid",
  ]);
  const tramadol = matchMeds(["tramadol"]);
  const digoxin = matchMeds(["digoxin"]);
  const amiodarone = matchMeds(["amiodarone"]);
  const verapamil = matchMeds(["verapamil"]);

  for (const bt of bloodThinners) {
    for (const nsaid of nsaids) {
      pushInteraction(
        bt.name,
        nsaid.name,
        "high",
        "Increased bleeding risk when anticoagulants or antiplatelets are combined with NSAIDs/aspirin."
      );
    }
  }

  for (const opioid of opioids) {
    for (const sedative of sedatives) {
      pushInteraction(
        opioid.name,
        sedative.name,
        "high",
        "Risk of respiratory depression and oversedation when opioids are combined with benzodiazepines or sedatives."
      );
    }
  }

  for (const ace of aceInhibitors) {
    for (const k of potassiumSparing) {
      pushInteraction(
        ace.name,
        k.name,
        "moderate",
        "Risk of hyperkalemia when ACE inhibitors are combined with potassium-sparing diuretics."
      );
    }
  }

  for (const mt of methotrexate) {
    for (const nsaid of nsaids) {
      pushInteraction(
        mt.name,
        nsaid.name,
        "high",
        "Risk of methotrexate toxicity increased by NSAIDs."
      );
    }
  }

  for (const ssri of ssris) {
    for (const maoi of maois) {
      pushInteraction(
        ssri.name,
        maoi.name,
        "high",
        "Risk of serotonin syndrome when SSRIs are combined with MAO inhibitors."
      );
    }
  }

  for (const ssri of ssris) {
    for (const tram of tramadol) {
      pushInteraction(
        ssri.name,
        tram.name,
        "high",
        "Risk of serotonin syndrome when SSRIs are combined with tramadol."
      );
    }
  }

  for (const dig of digoxin) {
    for (const amio of amiodarone) {
      pushInteraction(
        dig.name,
        amio.name,
        "high",
        "Amiodarone can increase digoxin levels and toxicity risk."
      );
    }
    for (const vera of verapamil) {
      pushInteraction(
        dig.name,
        vera.name,
        "high",
        "Verapamil can increase digoxin levels and toxicity risk."
      );
    }
  }

  return interactions;
};

// Check for potentially dangerous drug-drug interactions
async function checkDrugInteractions(
  medications: Array<{ name: string; genericName?: string; [key: string]: any }>,
  userContext?: AiUserContext
): Promise<DrugInteraction[]> {
  if (!medications || medications.length < 2) {
    return [];
  }

  // Normalize and de-duplicate medication list
  const normalizedMeds = (medications || [])
    .map((m) => {
      const name = typeof m?.name === "string" ? m.name.trim() : "";
      const generic = typeof m?.genericName === "string" ? m.genericName.trim() : "";
      const inferred = !generic ? inferGenericNameFromMedicationLabel(name) : "";
      return {
        name,
        genericName: generic || inferred || undefined,
      };
    })
    .filter((m) => m.name.length > 0);

  // Avoid spending tokens on duplicate meds
  const uniqueKeyed = new Map<string, { name: string; genericName?: string }>();
  for (const med of normalizedMeds) {
    const key = `${med.name.toLowerCase()}|${(med.genericName || "").toLowerCase()}`;
    if (!uniqueKeyed.has(key)) uniqueKeyed.set(key, med);
  }
  const uniqueMeds = Array.from(uniqueKeyed.values()).sort((a, b) => {
    const aKey = `${a.name.toLowerCase()}|${(a.genericName || "").toLowerCase()}`;
    const bKey = `${b.name.toLowerCase()}|${(b.genericName || "").toLowerCase()}`;
    return aKey.localeCompare(bKey);
  });

  if (uniqueMeds.length < 2) {
    return [];
  }

  const medList = uniqueMeds
    .map((m) => (m.genericName ? `${m.name} (generic: ${m.genericName})` : m.name))
    .join(", ");

  const cacheKey = getDrugInteractionCacheKey(uniqueMeds);
  const ruleBasedInteractions = detectRuleBasedInteractions(uniqueMeds);
  const cached = drugInteractionCache.get(cacheKey);
  if (cached) {
    const combined = [...ruleBasedInteractions, ...cached];
    const uniqueCombined = new Map<string, DrugInteraction>();
    for (const entry of combined) {
      const key = [entry.drug1.toLowerCase(), entry.drug2.toLowerCase()].sort().join("|");
      if (!uniqueCombined.has(key)) uniqueCombined.set(key, entry);
    }
    return Array.from(uniqueCombined.values());
  }

  const parseInteractions = (raw: string): DrugInteraction[] => {
    const tryParse = (text: string): any | null => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    };

    const direct = tryParse(raw);
    const parsed =
      direct ??
      (() => {
        const match = raw.match(/\{[\s\S]*\}/);
        return match ? tryParse(match[0]) : null;
      })();

    const interactions = parsed?.interactions;
    if (!Array.isArray(interactions)) return [];

    // Sanitize + dedupe
    const cleaned: DrugInteraction[] = [];
    const seen = new Set<string>();
    for (const i of interactions) {
      const drug1 = typeof i?.drug1 === "string" ? i.drug1.trim() : "";
      const drug2 = typeof i?.drug2 === "string" ? i.drug2.trim() : "";
      if (!drug1 || !drug2) continue;
      if (drug1.toLowerCase() === drug2.toLowerCase()) continue;

      const severityRaw = typeof i?.severity === "string" ? i.severity.trim().toLowerCase() : "moderate";
      const severity: DrugInteraction["severity"] =
        severityRaw === "high" || severityRaw === "low" || severityRaw === "moderate"
          ? (severityRaw as any)
          : "moderate";

      const description = typeof i?.description === "string" ? i.description.trim() : "";
      const key = [drug1.toLowerCase(), drug2.toLowerCase()].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      cleaned.push({ drug1, drug2, severity, description });
    }
    return cleaned;
  };

  try {
    // Use preferred accurate model for drug interactions
    const deterministicSeed = 42;
    const aiUserContext: AiUserContext = userContext ?? { userId: null, username: null };
    const response = await executeSecureTextCompletion({
      endpoint: "/api/ai/drug-interactions",
      feature: "drug_interactions",
      model: getAccurateModel(),
      userContext: aiUserContext,
      inputText: `Check for interactions in this medication list: ${medList}`,
      systemPrompt: `You are a UK clinical pharmacist with BNF expertise. Identify dangerous drug-drug interactions.

CHECK CATEGORIES (in order of clinical severity):
1. Anticoagulants (warfarin, apixaban, rivaroxaban, edoxaban, dabigatran) + NSAIDs/aspirin/antiplatelets → bleeding risk
2. Opioids (codeine, morphine, tramadol, fentanyl, oxycodone) + benzodiazepines/gabapentinoids/Z-drugs → respiratory depression
3. ACE inhibitors/ARBs + potassium-sparing diuretics (spironolactone, amiloride) + potassium supplements → hyperkalaemia
4. Methotrexate + NSAIDs/trimethoprim → methotrexate toxicity
5. SSRIs/SNRIs + MAOIs/tramadol/triptans → serotonin syndrome
6. Digoxin + amiodarone/verapamil/diltiazem → digoxin toxicity
7. Lithium + NSAIDs/ACE inhibitors/thiazides → lithium toxicity
8. QT-prolonging combinations (metoclopramide + haloperidol + amiodarone + SSRIs) → cardiac arrhythmia
9. Antihypertensives stacking (multiple BP-lowering agents) → postural hypotension & falls risk (critical in elderly)
10. CNS depressant stacking (multiple sedating agents) → excessive sedation & falls
11. Anticholinergic burden (oxybutynin + amitriptyline + chlorphenamine) → confusion, urinary retention, constipation
12. Corticosteroids + NSAIDs → GI bleeding

SEVERITY RULES:
- "high": life-threatening or requires immediate review (bleeding, respiratory depression, serotonin syndrome, arrhythmia)
- "moderate": clinically significant, needs monitoring or dose adjustment
- "low": minor or manageable with standard monitoring

Return JSON: {"interactions": [{"drug1": "Name1", "drug2": "Name2", "severity": "high|moderate|low", "description": "Brief clinical concern with mechanism"}]}
If none found: {"interactions": []}`
,
      maxCompletionTokens: 800,
      temperature: 0,
      seed: deterministicSeed,
      responseFormat: { type: "json_object" },
      useCache: false,
    });

    const content = response.restoredText || "";
    const result = parseInteractions(content)
      .concat(ruleBasedInteractions)
      .sort((a, b) => {
        const severityRank = (s: DrugInteraction["severity"]) => (s === "high" ? 0 : s === "moderate" ? 1 : 2);
        const rank = severityRank(a.severity) - severityRank(b.severity);
        if (rank !== 0) return rank;
        const aKey = [a.drug1.toLowerCase(), a.drug2.toLowerCase()].sort().join("|");
        const bKey = [b.drug1.toLowerCase(), b.drug2.toLowerCase()].sort().join("|");
        return aKey.localeCompare(bKey);
      });
    const deduped = new Map<string, DrugInteraction>();
    for (const entry of result) {
      const key = [entry.drug1.toLowerCase(), entry.drug2.toLowerCase()].sort().join("|");
      if (!deduped.has(key)) deduped.set(key, entry);
    }
    const finalResult = Array.from(deduped.values());
    drugInteractionCache.set(cacheKey, finalResult);
    return finalResult;
  } catch (error: unknown) {
    console.error("[Drug Interactions] Check failed:", safeErrorMessage(error, "unknown error"));
    return ruleBasedInteractions;
  }
}

// Table structure detection for EMAR grid layouts
interface TableStructureInfo {
  hasTable: boolean;
  columns: string[];
  rowCount: number;
  tableType: 'grid' | 'list' | 'unknown';
  columnBoundaries: number[];
  detectedTimeSlots: string[];
  detectedDatesOnSameLine: number;
}

function detectTableStructure(text: string): TableStructureInfo {
  const result: TableStructureInfo = {
    hasTable: false,
    columns: [],
    rowCount: 0,
    tableType: 'unknown',
    columnBoundaries: [],
    detectedTimeSlots: [],
    detectedDatesOnSameLine: 0,
  };
  
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return result;
  
  // Pattern 1: Detect repeated date patterns on the same line (indicates grid columns)
  const datePattern = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,\s]+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi;
  const shortDatePattern = /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g;
  
  let maxDatesOnLine = 0;
  let dateHeaderLine = '';
  
  for (const line of lines) {
    const longDates = line.match(datePattern) || [];
    const shortDates = line.match(shortDatePattern) || [];
    const totalDates = longDates.length + shortDates.length;
    
    if (totalDates > maxDatesOnLine) {
      maxDatesOnLine = totalDates;
      dateHeaderLine = line;
    }
  }
  
  result.detectedDatesOnSameLine = maxDatesOnLine;
  
  // Pattern 2: Detect time slot headers (e.g., "08:00", "12:00", "20:00")
  const timeSlotPattern = /\b(\d{1,2}:\d{2})(?:\s*-\s*\d{1,2}:\d{2})?\b/g;
  const allTimeSlots = new Set<string>();
  
  for (const line of lines) {
    let match;
    const lineTimeSlots: string[] = [];
    const tempPattern = new RegExp(timeSlotPattern.source, 'g');
    
    while ((match = tempPattern.exec(line)) !== null) {
      lineTimeSlots.push(match[1]);
      allTimeSlots.add(match[1]);
    }
    
    // If multiple time slots on same line, likely a header row
    if (lineTimeSlots.length >= 3) {
      result.columns = lineTimeSlots;
    }
  }
  
  result.detectedTimeSlots = Array.from(allTimeSlots).sort();
  
  // Pattern 3: Detect column boundaries based on consistent spacing
  const spacingPattern = /\s{3,}/g;
  const columnPositions: Map<number, number> = new Map();
  
  for (const line of lines.slice(0, 50)) { // Check first 50 lines for structure
    let match;
    while ((match = spacingPattern.exec(line)) !== null) {
      const pos = Math.round(match.index / 10) * 10; // Bucket positions
      columnPositions.set(pos, (columnPositions.get(pos) || 0) + 1);
    }
  }
  
  // Find consistent column positions (appearing in >30% of lines)
  const threshold = Math.max(3, lines.length * 0.3);
  const consistentPositions = Array.from(columnPositions.entries())
    .filter(([_, count]) => count >= threshold)
    .map(([pos, _]) => pos)
    .sort((a, b) => a - b);
  
  result.columnBoundaries = consistentPositions;
  
  // Determine table type
  if (maxDatesOnLine >= 3 && result.detectedTimeSlots.length >= 2) {
    result.hasTable = true;
    result.tableType = 'grid';
    // Grid: dates as columns, medications as rows, time slots as sub-rows
  } else if (maxDatesOnLine >= 2 || consistentPositions.length >= 2) {
    result.hasTable = true;
    result.tableType = 'grid';
  } else if (result.detectedTimeSlots.length >= 2) {
    result.hasTable = true;
    result.tableType = 'list';
    // List: each entry on its own line with date/time/status
  }
  
  // Count potential data rows (lines with medication-like content)
  const medicationPattern = /\b\d+\s*(mg|mcg|ml|g|tablet|capsule|patch|spray|unit|iu)s?\b/i;
  let rowCount = 0;
  for (const line of lines) {
    if (medicationPattern.test(line)) {
      rowCount++;
    }
  }
  result.rowCount = rowCount;
  
  // Extract column headers if we have date columns
  if (dateHeaderLine && maxDatesOnLine >= 2) {
    const dates = dateHeaderLine.match(datePattern) || dateHeaderLine.match(shortDatePattern) || [];
    result.columns = dates.slice(0, 31); // Max 31 days in a month
  }
  
  return result;
}

// Session type extension
declare module "express-session" {
  interface SessionData {
    userId?: string;
    isDemo?: boolean;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  
  // Load AI settings from database on startup
  if (hasDatabaseUrl) {
    await ensureSettingsLoaded();
  }
  
  // WebSocket server for real-time notifications (logout warnings).
  // Use manual upgrade routing so Vite HMR upgrades on `/vite-hmr` are not intercepted.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const host = request.headers.host || "localhost";

    let pathname = "";
    try {
      pathname = new URL(request.url || "", `http://${host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== "/ws") {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
  
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const userId = url.searchParams.get("userId");

    // Authenticate WebSocket connections by verifying the session cookie.
    // Without this, any client could connect with an arbitrary userId.
    const fakeRes = { setHeader: () => {}, getHeader: () => undefined, end: () => {} } as any;
    sessionMiddleware(req as any, fakeRes, () => {
      const sessionUserId = (req as any).session?.userId;
      // Validate the requested userId matches the authenticated session
      if (!sessionUserId || !userId || String(sessionUserId) !== String(userId)) {
        ws.close(4001, "Unauthorized");
        return;
      }

      connectedClients.set(userId, ws);

      ws.on("close", () => {
        connectedClients.delete(userId);
      });

      ws.on("error", () => {
        connectedClients.delete(userId);
      });
    });
  });

  const sendToUser = (userId: string, message: any) => {
    const client = connectedClients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  };

  const forceLogoutUser = async (activeSession: any) => {
    sendToUser(activeSession.userId, {
      type: "FORCE_LOGOUT_WARNING",
      message: "An administrator needs access. You will be logged out in 30 seconds.",
      seconds: FORCE_LOGOUT_WARNING_SECONDS,
    });

    setTimeout(async () => {
      sendToUser(activeSession.userId, {
        type: "FORCE_LOGOUT",
        message: "You have been logged out to allow administrator access.",
      });

      if (sessionStore) {
        sessionStore.destroy(activeSession.sessionId, (err: any) => {
          if (err) console.error("Failed to destroy session:", err);
        });
      }

      await storage.deleteActiveSession(activeSession.sessionId);
    }, FORCE_LOGOUT_WARNING_SECONDS * 1000);
  };

  if (!process.env.SESSION_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable must be set in production.");
    }
    console.warn("[Auth] SESSION_SECRET not set — using random ephemeral secret for development. Sessions will not persist across restarts.");
  }
  const crypto = await import("node:crypto");
  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

  // Session store: prefer Postgres when available, fall back to in-memory for local dev
  if (hasDatabaseUrl) {
    const PgSession = connectPgSimple(session);
    const pool = new Pool(getPgPoolConfig(process.env.DATABASE_URL));
    sessionStore = new PgSession({ pool, createTableIfMissing: true });
  } else {
    sessionStore = null;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Auth] DATABASE_URL not set. Using in-memory sessions and enabling demo login for development.");
    }
  }

  // Session middleware (skip for Vite HMR WebSocket)
  // Note: trust proxy is set in index.ts (before routes are registered)
  const sessionMiddleware = session({
    ...(sessionStore ? { store: sessionStore } : {}),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      // "none" is required for the split Render architecture where the static
      // site (care-assurance-web) and the API (care-assurance-api) live on
      // different origins.  Combined with secure:true + CSRF origin validation
      // this is safe.  If moving to same-origin, change to "lax".
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 30, // 30 minutes - auto logout on inactivity
    },
    rolling: true, // Reset cookie expiration on each request (keeps session alive while active)
  });
  
  // Apply session middleware conditionally (skip for Vite HMR)
  app.use((req, res, next) => {
    if (req.path.startsWith("/vite-hmr")) {
      return next();
    }
    return sessionMiddleware(req, res, next);
  });

  // CSRF Protection: Verify Origin/Referer header for state-changing requests
  // This protects against cross-site request forgery by validating the request source
  const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    // Skip for safe methods (GET, HEAD, OPTIONS)
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
      return next();
    }
    
    // Only disable CSRF if explicitly opted out AND not in production.
    // This prevents accidental CSRF bypass in live deployments.
    if (process.env.DISABLE_CSRF === 'true' && process.env.NODE_ENV !== 'production') {
      return next();
    }
    
    // Skip for API extension endpoints accessed from browser extension
    // (these are authenticated via content script proxy)
    if (req.path.startsWith('/api/extension')) {
      return next();
    }
    
    const origin = req.get('Origin');
    const referer = req.get('Referer');
    const host = req.get('Host');
    
    // Must have either Origin or Referer header
    if (!origin && !referer) {
      console.warn(`[CSRF] Request blocked - no Origin/Referer: ${req.method} ${req.path}`);
      return res.status(403).json({ message: 'CSRF validation failed: missing origin' });
    }
    
    // Validate origin against explicit allow-list
    const allowedOrigins = new Set<string>([
      `https://${process.env.CANONICAL_DOMAIN || 'careassurance.uk'}`,
      `https://www.${process.env.CANONICAL_DOMAIN || 'careassurance.uk'}`,
    ]);

    // Allow configured CORS origins (supports comma-separated values)
    const configuredCorsOrigins = (process.env.CORS_ORIGIN || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    for (const configuredOrigin of configuredCorsOrigins) {
      allowedOrigins.add(configuredOrigin);
    }

    // Allow local dev origins outside production
    if (process.env.NODE_ENV !== 'production') {
      [
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5000',
        'http://127.0.0.1:5173',
      ].forEach((origin) => allowedOrigins.add(origin));
    }
    
    // Allow the Render API hostname (set automatically by Render)
    const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME;
    if (renderHost) {
      allowedOrigins.add(`https://${renderHost}`);
    }
    
    // Allow browser extension origins
    const isExtensionOrigin = origin?.startsWith('chrome-extension://') || 
                               origin?.startsWith('moz-extension://');
    
    const originToCheck = origin || (referer ? new URL(referer).origin : null);
    
    if (!isExtensionOrigin && originToCheck && !allowedOrigins.has(originToCheck)) {
      console.warn(`[CSRF] Request blocked - invalid origin: ${originToCheck} for ${req.method} ${req.path}`);
      logSecurityEvent({
        eventType: 'CSRF_BLOCKED',
        endpoint: req.path,
        ipAddress: req.ip,
        details: {
          reason: 'CSRF validation failed - invalid origin',
          origin: originToCheck,
          method: req.method,
        }
      });
      return res.status(403).json({ message: 'CSRF validation failed: invalid origin' });
    }
    
    next();
  };
  
  // Apply CSRF protection to API routes
  app.use('/api', csrfProtection);

  // ── Rate Limiting ─────────────────────────────────────────────────────────────
  // NOTE: Global API, auth, and admin rate limiters are defined in server/index.ts
  // (with polling-endpoint exemptions and proper key generators).
  // Only add route-specific limiters here that are NOT covered by index.ts.

  // Moderate rate limit for AI endpoints: 15 requests per minute per IP
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "AI processing rate limit reached — please try again in a moment." },
    skip: () => process.env.NODE_ENV !== 'production',
  });
  app.use('/api/ai', aiLimiter);

  // Auth middleware — short-lived session cache to reduce DB round-trips.
  // Each authenticated request previously cost 3 DB queries. This cache reduces
  // it to 0 for repeat requests within the 5-second window, and debounces
  // the session activity update to once per 60 seconds.
  const AUTH_CACHE_TTL_MS = 5_000;
  const ACTIVITY_DEBOUNCE_MS = 60_000;
  const authSessionCache = new Map<string, { user: Express.Request["user"]; cachedAt: number }>();
  const lastActivityUpdate = new Map<string, number>();

  // Prune cache entries older than 2× TTL (runs lazily, not on interval)
  let lastAuthCachePrune = Date.now();
  const pruneAuthCache = () => {
    const now = Date.now();
    if (now - lastAuthCachePrune < AUTH_CACHE_TTL_MS * 4) return;
    lastAuthCachePrune = now;
    for (const [key, entry] of authSessionCache) {
      if (now - entry.cachedAt > AUTH_CACHE_TTL_MS * 2) authSessionCache.delete(key);
    }
    for (const [key, ts] of lastActivityUpdate) {
      if (now - ts > ACTIVITY_DEBOUNCE_MS * 2) lastActivityUpdate.delete(key);
    }
  };

  const buildDemoSessionUser = (sessionUserId: string): Express.Request["user"] => ({
    id: sessionUserId,
    username: "demo_user",
    firstName: "Demo",
    lastName: "User",
    email: "demo@careassurance.co.uk",
    role: "staff",
    status: "active",
    isDemo: true,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: "1.0",
  });

  const toAuthenticatedUser = (user: any): Express.Request["user"] => ({
    id: user.id,
    username: user.username,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    role: user.role === "admin" ? "admin" : "staff",
    status: user.status ?? null,
    jobTitle: user.jobTitle ?? null,
    email: user.email ?? null,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    termsVersion: user.termsVersion ?? null,
    termsSignatureName: user.termsSignatureName ?? null,
    termsSignatureDate: user.termsSignatureDate ?? null,
    isDemo: Boolean(user.isDemo),
  });

  const resolveAuthenticatedUser = async (req: Request): Promise<Express.Request["user"] | null> => {
    if (!req.session?.userId) {
      return null;
    }

    // Handle demo sessions with virtual user
    if (req.session.isDemo) {
      return buildDemoSessionUser(req.session.userId);
    }

    const cacheKey = `${req.session.userId}:${req.sessionID}`;
    const now = Date.now();
    pruneAuthCache();

    // Check cache first — avoids 3 DB queries for repeat requests
    const cached = authSessionCache.get(cacheKey);
    if (cached && now - cached.cachedAt < AUTH_CACHE_TTL_MS) {
      // Debounce session activity updates (fire-and-forget, at most once/60s)
      const lastUpdate = lastActivityUpdate.get(req.sessionID) ?? 0;
      if (now - lastUpdate > ACTIVITY_DEBOUNCE_MS) {
        lastActivityUpdate.set(req.sessionID, now);
        storage.updateSessionActivity(req.sessionID).catch(() => {});
      }
      return cached.user;
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || user.status !== "active") {
      authSessionCache.delete(cacheKey);
      return null;
    }

    // Check if session is still valid in active_sessions
    const activeSession = await storage.getActiveSessionBySessionId(req.sessionID);
    if (!activeSession || String(activeSession.userId) !== String(req.session.userId)) {
      authSessionCache.delete(cacheKey);
      req.session.destroy(() => {});
      return null;
    }

    // Update last activity (debounced — at most once per 60s per session)
    const lastUpdate = lastActivityUpdate.get(req.sessionID) ?? 0;
    if (now - lastUpdate > ACTIVITY_DEBOUNCE_MS) {
      lastActivityUpdate.set(req.sessionID, now);
      await storage.updateSessionActivity(req.sessionID);
    }

    // Cache the resolved user
    const authenticatedUser = toAuthenticatedUser(user);
    authSessionCache.set(cacheKey, { user: authenticatedUser, cachedAt: now });
    return authenticatedUser;
  };

  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return apiUnauthorized(res);
    }
    req.user = user;

    if (req.user?.role !== "admin" && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      try {
        const platformControls = await getPlatformControls();
        const runtime = getPlatformControlsRuntime(platformControls);
        if (runtime.readOnlyActive) {
          return apiError(res, 503, platformControls.maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE, { code: "READ_ONLY_MODE" });
        }
      } catch (error) {
        console.error("Failed to load platform controls in auth middleware:", error);
      }
    }

    const shouldLog = false;
    if (shouldLog) {
      storage.createSystemLog({
        eventType: "api_request",
        userId: user.id,
        username: user.username,
        serviceUserInitials: null,
        details: {
          action: `API ${req.method} ${req.path}`,
          target: req.path,
          status: "Authorized",
          method: req.method,
          path: req.path,
        },
      }).catch((error) => {
        console.error("Failed to record system log:", error);
      });
    }
    next();
  };

  const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== "admin") {
      return apiForbidden(res, "Forbidden: Admin access required");
    }
    next();
  };

  const blockDemoWrites = async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.isDemo) {
      return apiForbidden(res, "Demo mode: Changes are not saved. Sign up to access all features.");
    }
    next();
  };

  // ===== AUTH ROUTES =====
  
  // Helper to get client IP address
  const getClientIp = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || 'unknown';
  };

  // Health check — no auth required; used by load balancers, uptime monitors, and render.yaml
  app.get("/api/health", async (_req, res) => {
    const uptime = process.uptime();
    const memoryMB = Math.round(process.memoryUsage().rss / 1_048_576);

    // Quick DB connectivity probe — use getAppSetting which is lightweight.
    // Only report connected if the query actually succeeds; a network/auth
    // error should correctly report "unavailable".
    let dbOk = false;
    if (hasDatabaseUrl) {
      try {
        await Promise.race([
          storage.getAppSetting("__health_probe__"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
        ]);
        dbOk = true; // query completed (even if key doesn't exist)
      } catch {
        dbOk = false; // genuine connection/timeout failure
      }
    }

    apiSuccess(res, {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      memoryMB,
      database: dbOk ? "connected" : "unavailable",
    });
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      if (!hasDatabaseUrl) {
        return res.status(503).json({
          message: "Development database is not configured (DATABASE_URL missing). Use demo login in development.",
        });
      }

      const { username, password } = req.body;
      const clientIp = getClientIp(req);
      const usernameValue = typeof username === "string" ? username : undefined;
      const attemptKey = getLoginAttemptKey(clientIp, usernameValue);
      pruneLoginAttempts();
      const blockedSeconds = getBlockedSeconds(attemptKey);
      if (blockedSeconds > 0) {
        logSecurityEvent({ 
          eventType: 'LOGIN_BLOCKED',
          endpoint: '/api/auth/login',
          ipAddress: clientIp, 
          username: usernameValue,
          details: {
            reason: 'Too many failed attempts',
            blockedSeconds 
          }
        });
        return apiTooManyRequests(res, `Too many login attempts. Try again in ${blockedSeconds} seconds.`);
      }
      
      // Check if IP is blocked
      if (clientIp && clientIp !== 'unknown') {
        const isBlocked = await storage.isIpBlocked(clientIp);
        if (isBlocked) {
          logSecurityEvent({ 
            eventType: 'IP_BLOCKED',
            endpoint: '/api/auth/login',
            ipAddress: clientIp, 
            username: usernameValue,
            details: {
              reason: 'IP address in block list' 
            }
          });
          return apiForbidden(res, "Access denied. Your IP address has been blocked.");
        }
      }
      
      if (!usernameValue || !password || typeof password !== "string") {
        recordLoginFailure(attemptKey, usernameValue);
        return apiBadRequest(res, "Username and password required");
      }

      const user = await storage.getUserByUsername(usernameValue);
      
      if (!user) {
        recordLoginFailure(attemptKey, usernameValue);
        logSecurityEvent({ 
          eventType: 'LOGIN_FAILED',
          endpoint: '/api/auth/login',
          ipAddress: clientIp, 
          username: usernameValue,
          details: {
            reason: 'User not found' 
          }
        });
        return apiUnauthorized(res, "Invalid credentials");
      }

      const isValidPassword = await storage.verifyPassword(password, user.password);
      if (!isValidPassword) {
        recordLoginFailure(attemptKey, usernameValue);
        logSecurityEvent({ 
          eventType: 'LOGIN_FAILED',
          endpoint: '/api/auth/login',
          ipAddress: clientIp, 
          username: usernameValue,
          userId: user.id,
          details: {
            reason: 'Invalid password' 
          }
        });
        return apiUnauthorized(res, "Invalid credentials");
      }

      if (user.status !== "active") {
        recordLoginFailure(attemptKey, usernameValue);
        logSecurityEvent({ 
          eventType: 'LOGIN_FAILED',
          endpoint: '/api/auth/login',
          ipAddress: clientIp, 
          username: usernameValue,
          userId: user.id,
          details: {
            reason: 'Account not active',
            status: user.status 
          }
        });
        return apiForbidden(res, "Account pending approval");
      }

      // Check if user is suspended
      if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.suspendedUntil).getTime() - Date.now()) / 60000);
        recordLoginFailure(attemptKey, usernameValue);
        logSecurityEvent({ 
          eventType: 'ACCOUNT_SUSPENDED',
          endpoint: '/api/auth/login',
          ipAddress: clientIp, 
          username: usernameValue,
          userId: user.id,
          details: {
            reason: 'Account suspended',
            suspendedUntil: user.suspendedUntil 
          }
        });
        return apiForbidden(res, `Account suspended. Please try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`);
      }

      // Check session limits for non-admin users
      const isAdmin = user.role === "admin";
      const existingSession = await storage.getActiveSessionByUserId(user.id);
      const nonAdminCount = await storage.getNonAdminSessionCount();
      
      let forcingLogout = false;
      
      if (!isAdmin && nonAdminCount >= MAX_NON_ADMIN_SESSIONS && !existingSession) {
        return apiError(res, 503, `System is at capacity (${MAX_NON_ADMIN_SESSIONS} users). Please try again later.`, { code: "SYSTEM_CAPACITY" });
      }
      
      // Admin priority: if admin logs in and all slots are full, force logout oldest non-admin
      if (isAdmin && nonAdminCount >= MAX_NON_ADMIN_SESSIONS && !existingSession) {
        const nonAdminSessions = await storage.getNonAdminActiveSessions();
        if (nonAdminSessions.length > 0) {
          const oldestSession = nonAdminSessions[0];
          await forceLogoutUser(oldestSession);
          forcingLogout = true;
        }
      }

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.userId = user.id;
      req.session.isDemo = false;
      
      // Explicitly save session before responding
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      clearLoginFailures(attemptKey);
      
      // Create active session record with IP address
      await storage.createActiveSession({
        userId: user.id,
        username: user.username,
        role: user.role,
        sessionId: req.sessionID,
        ipAddress: clientIp !== 'unknown' ? clientIp : null,
      });
      
      // Audit log: User login
      await storage.createSystemLog({
        eventType: 'user_login',
        userId: user.id,
        username: user.username,
        details: {
          ipAddress: clientIp,
          role: user.role,
          forced_logout: forcingLogout,
        },
      });
      
      // Create session history entry with IP address
      await storage.createSessionHistory({
        userId: user.id,
        username: user.username,
        sessionId: req.sessionID,
        ipAddress: clientIp !== 'unknown' ? clientIp : null,
      });
      
      // Update last online
      await storage.updateLastOnlineAt(user.id);
      
      return apiSuccess(res, {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        jobTitle: user.jobTitle,
        termsAcceptedAt: user.termsAcceptedAt,
        termsVersion: user.termsVersion,
        forcingLogout,
      });
    } catch (error: any) {
      const message = String(error?.message || error || "").toLowerCase();
      const isTransientDbFailure =
        message.includes("arrayparser.create is not a function") ||
        message.includes("self-signed certificate") ||
        message.includes("ssl off") ||
        message.includes("connect econnrefused") ||
        message.includes("enotfound") ||
        message.includes("connection terminated") ||
        message.includes("timeout") ||
        message.includes("no pg_hba.conf entry") ||
        message.includes("remaining connection slots are reserved");

      if (isTransientDbFailure) {
        return apiError(
          res,
          503,
          "Login is temporarily unavailable due to a database connection issue. Please try again shortly.",
          { code: "AUTH_DB_UNAVAILABLE" }
        );
      }

      console.error("[Auth] Login failed:", error);
      return apiInternalError(res, safeErrorMessage(error, "Login failed"));
    }
  });

  // Demo Login DISABLED for security (previously development only)
  // Re-enable by setting ENABLE_DEMO_MODE=true in development only
  if (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEMO_MODE === "true") {
    app.post("/api/auth/demo", async (req, res) => {
      try {
        const clientIp = getClientIp(req);

        // Check if IP is blocked
        if (hasDatabaseUrl && clientIp && clientIp !== 'unknown') {
          const isBlocked = await storage.isIpBlocked(clientIp);
          if (isBlocked) {
            return res.status(403).json({ message: "Access denied. Your IP address has been blocked." });
          }
        }

        // Create a virtual demo user (not stored in database)
        const demoUser = {
          id: 'demo-user-' + Date.now(),
          username: 'demo',
          firstName: 'Demo',
          lastName: 'User',
          role: 'staff' as const,
          status: 'active' as const,
          jobTitle: 'Demo Account',
          isDemo: true,
          termsVersion: '1.0',
          termsAcceptedAt: new Date().toISOString(),
          termsSignatureName: 'Demo User',
          termsSignatureDate: new Date().toLocaleDateString('en-GB'),
        };

        // Store demo session info
        await new Promise<void>((resolve, reject) => {
          req.session.regenerate((err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });

        req.session.userId = demoUser.id;
        req.session.isDemo = true;

        // Explicitly save session
        await new Promise<void>((resolve, reject) => {
          req.session.save((err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });

        return apiSuccess(res, demoUser);
      } catch (error: any) {
        return apiInternalError(res, safeErrorMessage(error, "Login failed"));
      }
    });
  }

  // Register (creates pending user)
  app.post("/api/auth/register", async (req, res) => {
    try {
      if (!hasDatabaseUrl) {
        return apiError(res, 503, "Development database is not configured (DATABASE_URL missing). Registration is disabled in this environment.", { code: "NO_DATABASE" });
      }

      const validatedData = insertUserSchema.parse(req.body);
      const passwordError = validatePassword(validatedData.password, validatedData.username);
      if (passwordError) {
        return apiBadRequest(res, passwordError);
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return apiBadRequest(res, "Username already exists");
      }

      const user = await storage.createUser({
        ...validatedData,
        role: "staff",
        status: "pending",
      });

      return apiCreated(res, { id: user.id }, "Account created. Awaiting admin approval.");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return apiBadRequest(res, "Validation error", { errors: formatZodErrors(error.errors) });
      }
      return apiInternalError(res, safeErrorMessage(error, "Registration failed"));
    }
  });

  const toPublicUser = (user: any) => ({
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    jobTitle: user.jobTitle,
    termsAcceptedAt: user.termsAcceptedAt,
    termsVersion: user.termsVersion,
    isDemo: Boolean(user.isDemo),
  });

  // Session snapshot endpoint - returns 200 for both signed-in and signed-out states.
  app.get("/api/auth/session", async (req: any, res) => {
    try {
      const user = await resolveAuthenticatedUser(req);
      if (!user) {
        return res.json({ authenticated: false });
      }
      return res.json({ authenticated: true, user: toPublicUser(user) });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to check session") });
    }
  });

  // Check session
  app.get("/api/auth/me", requireAuth, async (req: any, res) => {
    return apiSuccess(res, toPublicUser(req.user));
  });

  // Accept terms and conditions
  app.post("/api/auth/accept-terms", requireAuth, async (req: any, res) => {
    try {
      const { version, signatureName, signatureDate } = req.body;
      
      if (!version) {
        return apiBadRequest(res, "Terms version is required");
      }
      if (!signatureName || signatureName.trim().length < 2) {
        return apiBadRequest(res, "Please enter your full name");
      }
      if (!signatureDate) {
        return apiBadRequest(res, "Please enter today's date");
      }

      const updatedUser = await storage.updateUserTermsAcceptance(
        req.user.id,
        version,
        signatureName.trim(),
        signatureDate
      );

      if (!updatedUser) {
        return apiInternalError(res, "Failed to update user");
      }

      // Invalidate auth cache to ensure updated terms are reflected immediately
      const cacheKey = `${req.user.id}:${req.sessionID}`;
      authSessionCache.delete(cacheKey);

      // Update session user
      req.user.termsAcceptedAt = updatedUser.termsAcceptedAt;
      req.user.termsVersion = updatedUser.termsVersion || version;
      req.user.termsSignatureName = signatureName.trim();
      req.user.termsSignatureDate = signatureDate;

      return apiSuccess(res, {
        success: true,
        termsAcceptedAt: updatedUser.termsAcceptedAt,
        termsVersion: updatedUser.termsVersion || version,
        termsSignatureName: signatureName.trim(),
        termsSignatureDate: signatureDate,
      }, { message: "Terms accepted successfully" });
    } catch (error) {
      console.error("Error accepting terms:", error);
      return apiInternalError(res, "Failed to accept terms");
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.sessionID;
    const userId = req.session?.userId;
    
    // Invalidate auth cache for this session
    if (userId) {
      authSessionCache.delete(`${userId}:${sessionId}`);
    }
    lastActivityUpdate.delete(sessionId);
    
    // Update session history with logout time
    await storage.updateSessionLogout(sessionId, false);
    await storage.deleteActiveSession(sessionId);
    
    req.session.destroy((err) => {
      if (err) {
        return apiInternalError(res, "Logout failed");
      }
      res.clearCookie("connect.sid");
      return apiSuccess(res, { message: "Logged out successfully" });
    });
  });

  // Get active sessions (admin only)
  app.get("/api/active-sessions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const sessions = await storage.getAllActiveSessions();
      return apiSuccess(res, {
        sessions: sessions.map(s => ({
          id: s.id,
          username: s.username,
          role: s.role,
          lastActivity: s.lastActivity,
          createdAt: s.createdAt,
        })),
        maxNonAdminSessions: MAX_NON_ADMIN_SESSIONS,
      });
    } catch (error: any) {
      return apiInternalError(res, safeErrorMessage(error, "Failed to get active sessions"));
    }
  });

  // ===== USER MANAGEMENT ROUTES (Admin only) =====

  // Get all users
  app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      return res.json(users.map(u => ({
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        status: u.status,
        jobTitle: u.jobTitle,
        termsAcceptedAt: u.termsAcceptedAt,
        termsVersion: u.termsVersion,
        termsSignatureName: u.termsSignatureName,
        termsSignatureDate: u.termsSignatureDate,
        createdAt: u.createdAt,
      })));
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get users") });
    }
  });

  // Get pending users
  app.get("/api/users/pending", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getPendingUsers();
      return res.json(users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        jobTitle: u.jobTitle,
        createdAt: u.createdAt,
      })));
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get pending users") });
    }
  });

  // Create user (Admin)
  app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const passwordError = validatePassword(validatedData.password, validatedData.username);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...validatedData,
        status: "active", // Admin-created users are immediately active
      });

      return res.status(201).json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create user") });
    }
  });

  // Approve user
  app.patch("/api/users/:id/approve", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const user = await storage.updateUserStatus(req.params.id, "active");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Audit log: Admin approved user
      await storage.createSystemLog({
        eventType: 'user_approved',
        userId: req.user.id,
        username: req.user.username,
        details: {
          approved_user_id: user.id,
          approved_username: user.username,
        },
      });
      
      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to approve user") });
    }
  });

  // Reject user (delete)
  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      const userToDelete = users.find(u => u.id === req.params.id);
      await storage.deleteUser(req.params.id);
      
      // Audit log: Admin deleted user
      await storage.createSystemLog({
        eventType: 'user_deleted',
        userId: req.user.id,
        username: req.user.username,
        details: {
          deleted_user_id: req.params.id,
          deleted_username: userToDelete?.username || 'unknown',
        },
      });
      
      return res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete user") });
    }
  });

  // Update user job title
  app.patch("/api/users/:id/job-title", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { jobTitle } = req.body;
      if (jobTitle === undefined) {
        return res.status(400).json({ message: "Job title required" });
      }
      const user = await storage.updateUserJobTitle(req.params.id, jobTitle);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        jobTitle: user.jobTitle,
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update job title") });
    }
  });

  // Update user role
  app.patch("/api/users/:id/role", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { role } = req.body;
      if (!role || !["admin", "staff"].includes(role)) {
        return res.status(400).json({ message: "Valid role required (admin or staff)" });
      }
      const user = await storage.updateUserRole(req.params.id, role);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Audit log: Admin changed user role
      await storage.createSystemLog({
        eventType: 'user_role_changed',
        userId: req.user.id,
        username: req.user.username,
        details: {
          target_user_id: user.id,
          target_username: user.username,
          new_role: role,
        },
      });
      
      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        jobTitle: user.jobTitle,
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update role") });
    }
  });

  // Update user username (admin only)
  app.put("/api/users/:id/username", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username } = req.body;
      if (!username || typeof username !== "string" || username.trim().length < 2) {
        return res.status(400).json({ message: "Valid username required (at least 2 characters)" });
      }
      
      const existingUser = await storage.getUserByUsername(username.trim());
      if (existingUser && existingUser.id !== req.params.id) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const user = await storage.updateUsername(req.params.id, username.trim());
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        jobTitle: user.jobTitle,
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update username") });
    }
  });

  // Force disconnect user session (admin only)
  app.post("/api/sessions/:userId/disconnect", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      
      if (userId === req.user.id) {
        return res.status(400).json({ message: "Cannot disconnect your own session" });
      }
      
      const activeSession = await storage.getActiveSessionByUserId(userId);
      if (!activeSession) {
        return res.status(404).json({ message: "No active session found for this user" });
      }
      
      sendToUser(userId, {
        type: "FORCE_LOGOUT",
        message: "Your session has been terminated by an administrator.",
      });
      
      await storage.updateSessionLogout(activeSession.sessionId, true);
      await storage.deleteActiveSession(activeSession.sessionId);
      
      if (sessionStore) {
        sessionStore.destroy(activeSession.sessionId, (err: any) => {
          if (err) console.error("Failed to destroy session:", err);
        });
      }
      
      return res.json({ message: "User session disconnected successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to disconnect user") });
    }
  });

  // Update own profile (job title)
  app.patch("/api/auth/profile", requireAuth, async (req: any, res) => {
    try {
      const { jobTitle } = req.body;
      if (jobTitle !== undefined) {
        const user = await storage.updateUserJobTitle(req.user.id, jobTitle);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        return res.json({
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          jobTitle: user.jobTitle,
        });
      }
      return res.status(400).json({ message: "No valid fields to update" });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update profile") });
    }
  });

  // Change own password
  app.patch("/api/auth/password", requireAuth, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }
      
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const passwordError = validatePassword(newPassword, user.username);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      
      const isValidPassword = await storage.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        logSecurityEvent({
          eventType: 'LOGIN_FAILED',
          endpoint: '/api/auth/password',
          userId: req.user.id,
          username: req.user.username,
          details: {
            reason: 'Failed password change - incorrect current password'
          }
        });
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      
      const bcrypt = await import("bcrypt");
      const hashedPassword = await bcrypt.default.hash(newPassword, 10);
      await storage.updateUserPassword(req.user.id, hashedPassword);
      
      // Regenerate session after password change for additional security
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      req.session.userId = user.id;
      req.session.isDemo = false;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Update active session with new session ID
      await storage.deleteActiveSessionByUserId(user.id);
      await storage.createActiveSession({
        userId: user.id,
        username: user.username,
        role: user.role,
        sessionId: req.sessionID,
        ipAddress: null,
      });
      
      logSecurityEvent({
        eventType: 'PASSWORD_CHANGED',
        endpoint: '/api/auth/password',
        userId: req.user.id,
        username: req.user.username,
        details: {
          changedBy: 'self',
          sessionRegenerated: true
        }
      });
      
      return res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to change password") });
    }
  });

  // Admin reset user password
  app.post("/api/admin/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || typeof newPassword !== "string") {
        return res.status(400).json({ message: "New password required" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const passwordError = validatePassword(newPassword, user.username);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      
      const bcrypt = await import("bcrypt");
      const hashedPassword = await bcrypt.default.hash(newPassword, 10);
      await storage.updateUserPassword(req.params.id, hashedPassword);
      
      // Invalidate all active sessions for the user - forces re-login with new password
      await storage.deleteActiveSessionByUserId(req.params.id);
      
      logSecurityEvent({
        eventType: 'PASSWORD_RESET',
        endpoint: `/api/admin/users/${req.params.id}/reset-password`,
        userId: (req as any).user.id,
        username: (req as any).user.username,
        details: {
          targetUserId: req.params.id,
          targetUsername: user.username,
          changedBy: 'admin',
          sessionsInvalidated: true
        }
      });
      
      return res.json({ message: `Password reset for user ${user.username}. User will need to log in again.` });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to reset password") });
    }
  });

  // Admin reset all performance data
  app.post("/api/admin/reset-performance-data", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await storage.resetAllPerformanceData();
      return res.json({ 
        message: "All performance data cleared successfully",
        deleted: result
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to reset performance data") });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD ROUTES  →  server/routes/dashboard.ts
  // ═══════════════════════════════════════════════════════════════════════════
  registerDashboardRoutes(app, { requireAuth, blockDemoWrites });

  // ═══════════════════════════════════════════════════════════════════════════
  // CARE WORKER & DISCREPANCY ROUTES  →  server/routes/careWorkers.ts
  // ═══════════════════════════════════════════════════════════════════════════
  registerCareWorkerRoutes(app, { requireAuth, requireAdmin, blockDemoWrites });

  // ===== AUDIT ROUTES =====

  // Get all audits
  app.get("/api/audits", requireAuth, async (req, res) => {
    try {
      const audits = await storage.getAllAudits();
      return res.json(audits);
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load audits") });
    }
  });

  // Create audit
  app.post("/api/audits", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const validatedData = insertAuditSchema.parse(req.body);
      const audit = await storage.createAudit(validatedData);
      return res.status(201).json(audit);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create audit") });
    }
  });

  // Get care workers extracted from saved audits
  app.get("/api/audits/care-workers", requireAuth, async (req, res) => {
    try {
      const allAudits = await storage.getAllAudits();
      
      interface CareWorkerStats {
        name: string;
        auditCount: number;
        discrepancyCount: number;
        discrepancies: Array<{
          date: string;
          type: string;
          issue: string;
          auditId: string;
        }>;
        lastSeen: string;
      }
      
      const careWorkerMap = new Map<string, CareWorkerStats>();
      
      for (const audit of allAudits) {
        const results = audit.results as any;
        if (!results) continue;
        
        const auditType = audit.auditType;
        const auditDate = audit.periodEnd || audit.periodStart || "";
        
        if (auditType === "EMAR" && results.discrepancies) {
          for (const disc of results.discrepancies) {
            const name = disc.careWorkerName;
            if (!name || name === "Code Conflict") continue;
            
            if (!careWorkerMap.has(name)) {
              careWorkerMap.set(name, {
                name,
                auditCount: 0,
                discrepancyCount: 0,
                discrepancies: [],
                lastSeen: auditDate,
              });
            }
            
            const stats = careWorkerMap.get(name)!;
            stats.discrepancyCount++;
            stats.discrepancies.push({
              date: disc.date || auditDate,
              type: "EMAR",
              issue: disc.issue || `${disc.medication}: ${disc.issue || "Issue recorded"}`,
              auditId: audit.id,
            });
            if (auditDate > stats.lastSeen) stats.lastSeen = auditDate;
          }
        }
        
        if (auditType === "Visit") {
          if (results.careCalls) {
            for (const call of results.careCalls) {
              const name = call.careWorkerName;
              if (!name) continue;
              
              if (!careWorkerMap.has(name)) {
                careWorkerMap.set(name, {
                  name,
                  auditCount: 0,
                  discrepancyCount: 0,
                  discrepancies: [],
                  lastSeen: auditDate,
                });
              }
              
              const stats = careWorkerMap.get(name)!;
              stats.auditCount++;
              if (auditDate > stats.lastSeen) stats.lastSeen = auditDate;
              
              if (!call.compliant) {
                stats.discrepancyCount++;
                stats.discrepancies.push({
                  date: call.date || auditDate,
                  type: "Visit",
                  issue: call.comment || "Non-compliant visit",
                  auditId: audit.id,
                });
              }
            }
          }
          
          if (results.discrepancies) {
            for (const disc of results.discrepancies) {
              const name = disc.careWorkerName;
              if (!name) continue;
              
              if (!careWorkerMap.has(name)) {
                careWorkerMap.set(name, {
                  name,
                  auditCount: 0,
                  discrepancyCount: 0,
                  discrepancies: [],
                  lastSeen: auditDate,
                });
              }
              
              const stats = careWorkerMap.get(name)!;
              stats.discrepancyCount++;
              stats.discrepancies.push({
                date: disc.date || auditDate,
                type: "Visit",
                issue: disc.issue || "Discrepancy recorded",
                auditId: audit.id,
              });
              if (auditDate > stats.lastSeen) stats.lastSeen = auditDate;
            }
          }
        }
      }
      
      const careWorkers = Array.from(careWorkerMap.values())
        .sort((a, b) => b.discrepancyCount - a.discrepancyCount);
      
      return res.json(careWorkers);
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load care worker data") });
    }
  });

  // ===== ADMIN ALERT ROUTES =====

  // Platform controls (authenticated users receive safe subset for global messaging)
  app.get("/api/platform-controls", requireAuth, async (_req, res) => {
    try {
      const controls = await getPlatformControls();
      const runtime = getPlatformControlsRuntime(controls);
      // Short-lived client cache — this endpoint is polled frequently
      res.set("Cache-Control", "private, max-age=30");
      return res.json({
        maintenanceMode: controls.maintenanceMode,
        readOnlyMode: controls.readOnlyMode,
        maintenanceActive: runtime.maintenanceActive,
        readOnlyActive: runtime.readOnlyActive,
        maintenanceMessage: controls.maintenanceMessage,
        maintenanceWindowStart: controls.maintenanceWindowStart,
        maintenanceWindowEnd: controls.maintenanceWindowEnd,
        maintenanceWindowActive: runtime.maintenanceWindowActive,
        maintenanceWindowUpcoming: runtime.maintenanceWindowUpcoming,
        announcementEnabled: controls.announcementEnabled,
        announcementText: controls.announcementText,
        announcementSeverity: controls.announcementSeverity,
        updatedAt: controls.updatedAt,
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load platform settings") });
    }
  });

  // Platform controls (admin full view)
  app.get("/api/admin/platform-controls", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const controls = await getPlatformControls();
      const runtime = getPlatformControlsRuntime(controls);
      return res.json({
        ...controls,
        maintenanceActive: runtime.maintenanceActive,
        readOnlyActive: runtime.readOnlyActive,
        maintenanceWindowActive: runtime.maintenanceWindowActive,
        maintenanceWindowUpcoming: runtime.maintenanceWindowUpcoming,
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load platform controls") });
    }
  });

  app.put("/api/admin/platform-controls", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const parsed = platformControlsPatchSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message || "Invalid platform controls payload",
        });
      }

      const existing = await getPlatformControls();
      const updatePayload: Partial<PlatformControls> = {};

      if (parsed.data.maintenanceMode !== undefined) {
        updatePayload.maintenanceMode = parsed.data.maintenanceMode;
      }
      if (parsed.data.readOnlyMode !== undefined) {
        updatePayload.readOnlyMode = parsed.data.readOnlyMode;
      }
      if (parsed.data.maintenanceMessage !== undefined) {
        updatePayload.maintenanceMessage =
          sanitizePlatformText(parsed.data.maintenanceMessage) || DEFAULT_MAINTENANCE_MESSAGE;
      }
      if (parsed.data.maintenanceWindowStart !== undefined) {
        updatePayload.maintenanceWindowStart = normalizeIsoDateTime(parsed.data.maintenanceWindowStart);
      }
      if (parsed.data.maintenanceWindowEnd !== undefined) {
        updatePayload.maintenanceWindowEnd = normalizeIsoDateTime(parsed.data.maintenanceWindowEnd);
      }
      if (parsed.data.announcementEnabled !== undefined) {
        updatePayload.announcementEnabled = parsed.data.announcementEnabled;
      }
      if (parsed.data.announcementText !== undefined) {
        updatePayload.announcementText = sanitizePlatformText(parsed.data.announcementText);
      }
      if (parsed.data.announcementSeverity !== undefined) {
        updatePayload.announcementSeverity = parsed.data.announcementSeverity;
      }

      const nextAnnouncementText = (
        updatePayload.announcementText ?? existing.announcementText
      ).trim();
      const nextAnnouncementEnabled =
        updatePayload.announcementEnabled ?? existing.announcementEnabled;
      if (nextAnnouncementEnabled && !nextAnnouncementText) {
        return res.status(400).json({
          message: "Announcement text is required when announcement is enabled",
        });
      }

      const nextWindowStart =
        updatePayload.maintenanceWindowStart !== undefined
          ? updatePayload.maintenanceWindowStart
          : existing.maintenanceWindowStart;
      const nextWindowEnd =
        updatePayload.maintenanceWindowEnd !== undefined
          ? updatePayload.maintenanceWindowEnd
          : existing.maintenanceWindowEnd;
      const hasWindowStart = Boolean(nextWindowStart);
      const hasWindowEnd = Boolean(nextWindowEnd);
      if (hasWindowStart !== hasWindowEnd) {
        return res.status(400).json({
          message: "Provide both maintenance window start and end, or clear both values.",
        });
      }
      if (hasWindowStart && hasWindowEnd) {
        const startMs = Date.parse(nextWindowStart as string);
        const endMs = Date.parse(nextWindowEnd as string);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          return res.status(400).json({
            message: "Maintenance window end must be after the start time.",
          });
        }
      }

      const controls = await updatePlatformControls(updatePayload, req.user?.id);

      storage
        .createSystemLog({
          eventType: "platform_controls_updated",
          userId: req.user?.id,
          username: req.user?.username,
          serviceUserInitials: null,
          details: {
            action: "Updated platform controls",
            target: "platform_controls",
            status: "Success",
            updates: updatePayload,
          },
        })
        .catch(() => {});

      return res.json({ message: "Platform controls updated", controls });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update platform controls") });
    }
  });

  // Emergency announcement control: immediately stop and clear global broadcast
  app.post(
    "/api/admin/platform-controls/announcement/stop",
    requireAuth,
    requireAdmin,
    blockDemoWrites,
    async (req: any, res) => {
      try {
        const existing = await getPlatformControls();
        if (!existing.announcementEnabled && !existing.announcementText.trim()) {
          return res.json({
            message: "Global announcement is already stopped",
            controls: existing,
          });
        }

        const controls = await updatePlatformControls(
          {
            announcementEnabled: false,
            announcementText: "",
          },
          req.user?.id
        );

        storage
          .createSystemLog({
            eventType: "platform_announcement_stopped",
            userId: req.user?.id,
            username: req.user?.username,
            serviceUserInitials: null,
            details: {
              action: "Stopped global announcement broadcast",
              target: "platform_controls",
              status: "Success",
            },
          })
          .catch(() => {});

        return res.json({ message: "Global announcement stopped", controls });
      } catch (error: any) {
        return res.status(500).json({ message: safeErrorMessage(error, "Failed to stop announcement") });
      }
    }
  );

  app.get("/api/admin/ops-incidents", requireAuth, requireAdmin, async (req, res) => {
    try {
      const requestedLimit = parseInt(String(req.query.limit || "12"), 10);
      const limit = Math.min(50, Math.max(5, Number.isFinite(requestedLimit) ? requestedLimit : 12));
      const logsResult = await storage.getSystemLogsPaginated({
        page: 1,
        limit: 80,
        status: "all",
        search: "",
      });

      const interestingEventTypes = new Set([
        "platform_controls_updated",
        "admin_alerts_cleared",
        "sessions_force_disconnected",
        "security_login_failed",
        "security_login_blocked",
        "security_ip_blocked",
        "security_account_suspended",
        "security_csrf_blocked",
      ]);

      const incidents = logsResult.logs
        .filter((log: any) => {
          const eventType = String(log.eventType || "").toLowerCase();
          if (eventType.startsWith("security_")) return true;
          if (interestingEventTypes.has(eventType)) return true;
          const status = typeof log.details === "object" && log.details
            ? String((log.details as any).status || "").toLowerCase()
            : "";
          return status === "blocked" || status === "flagged" || status === "warning";
        })
        .slice(0, limit)
        .map((log: any) => {
          const eventType = String(log.eventType || "").toLowerCase();
          const status = typeof log.details === "object" && log.details
            ? String((log.details as any).status || "").toLowerCase()
            : "";
          let severity: "info" | "warning" | "critical" = "info";
          if (
            eventType.includes("blocked") ||
            eventType.includes("suspended") ||
            eventType.includes("force_disconnected") ||
            status === "blocked"
          ) {
            severity = "critical";
          } else if (status === "flagged" || status === "warning" || eventType.includes("security_")) {
            severity = "warning";
          }

          return {
            id: log.id,
            eventType: log.eventType,
            username: log.username || "system",
            createdAt: log.createdAt,
            severity,
            action:
              typeof log.details === "object" && log.details
                ? String((log.details as any).action || log.eventType)
                : String(log.eventType),
            status:
              typeof log.details === "object" && log.details
                ? String((log.details as any).status || "")
                : "",
          };
        });

      return res.json({
        generatedAt: new Date().toISOString(),
        total: incidents.length,
        incidents,
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load operations incidents") });
    }
  });

  // Get unread alerts (admin only)
  app.get("/api/admin-alerts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const alerts = await storage.getUnreadAdminAlerts();
      return res.json(alerts);
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load alerts") });
    }
  });

  // Mark alert as read
  app.patch("/api/admin-alerts/:id/read", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.markAlertAsRead(req.params.id);
      return res.json({ message: "Alert marked as read" });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update alert") });
    }
  });

  // Mark all admin alerts as read
  app.post("/api/admin-alerts/mark-all-read", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const alerts = await storage.getUnreadAdminAlerts();
      if (alerts.length === 0) {
        return res.json({ message: "No unread alerts", cleared: 0 });
      }

      await Promise.all(alerts.map((alert) => storage.markAlertAsRead(alert.id)));

      storage
        .createSystemLog({
          eventType: "admin_alerts_cleared",
          userId: req.user?.id,
          username: req.user?.username,
          serviceUserInitials: null,
          details: {
            action: "Cleared all unread admin alerts",
            target: "admin_alerts",
            status: "Success",
            count: alerts.length,
          },
        })
        .catch(() => {});

      return res.json({ message: "All alerts marked as read", cleared: alerts.length });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update alerts") });
    }
  });

  // Operations health telemetry
  app.get("/api/admin/ops-health", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const [
        totalSessions,
        nonAdminSessions,
        allUsers,
        unreadAlerts,
        blockedIpEntries,
        unreadContactMessages,
        controls,
      ] = await Promise.all([
        storage.getActiveSessionCount(),
        storage.getNonAdminSessionCount(),
        storage.getAllUsers(),
        storage.getUnreadAdminAlerts(),
        storage.getAllBlockedIps(),
        storage.getUnreadContactMessageCount(),
        getPlatformControls(),
      ]);

      const now = new Date();
      const platformRuntime = getPlatformControlsRuntime(controls);
      const adminUsers = allUsers.filter((user) => user.role === "admin").length;
      const staffUsers = allUsers.filter((user) => user.role !== "admin").length;
      const pendingUsers = allUsers.filter((user) => user.status === "pending").length;
      const activeUsers = allUsers.filter((user) => user.status === "active").length;
      const suspendedUsers = allUsers.filter((user) => {
        if (!user.suspendedUntil) return false;
        return new Date(user.suspendedUntil) > now;
      }).length;

      const memory = process.memoryUsage();
      const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;

      return res.json({
        generatedAt: now.toISOString(),
        runtime: {
          uptimeSeconds: Math.round(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
          loadAverage: os.loadavg(),
        },
        memory: {
          rssMb: toMb(memory.rss),
          heapUsedMb: toMb(memory.heapUsed),
          heapTotalMb: toMb(memory.heapTotal),
          externalMb: toMb(memory.external),
          arrayBuffersMb: toMb(memory.arrayBuffers),
        },
        sessions: {
          total: totalSessions,
          nonAdmin: nonAdminSessions,
          webSocketClients: connectedClients.size,
        },
        users: {
          total: allUsers.length,
          admins: adminUsers,
          staff: staffUsers,
          active: activeUsers,
          pending: pendingUsers,
          suspended: suspendedUsers,
        },
        alerts: {
          unreadAdminAlerts: unreadAlerts.length,
          unreadContactMessages,
        },
        security: {
          blockedIps: blockedIpEntries.length,
        },
        platform: {
          maintenanceMode: controls.maintenanceMode,
          readOnlyMode: controls.readOnlyMode,
          maintenanceActive: platformRuntime.maintenanceActive,
          readOnlyActive: platformRuntime.readOnlyActive,
          maintenanceWindowStart: controls.maintenanceWindowStart,
          maintenanceWindowEnd: controls.maintenanceWindowEnd,
          maintenanceWindowActive: platformRuntime.maintenanceWindowActive,
          maintenanceWindowUpcoming: platformRuntime.maintenanceWindowUpcoming,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load health data") });
    }
  });

  // Emergency control: disconnect all non-admin sessions
  app.post("/api/admin/sessions/disconnect-non-admin", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const sessions = await storage.getNonAdminActiveSessions();
      if (sessions.length === 0) {
        return res.json({ message: "No active non-admin sessions", disconnected: 0 });
      }

      await Promise.all(
        sessions.map(async (activeSession) => {
          sendToUser(String(activeSession.userId), {
            type: "FORCE_LOGOUT",
            message: "Your session has been terminated by an administrator.",
          });

          await storage.updateSessionLogout(activeSession.sessionId, true);
          await storage.deleteActiveSession(activeSession.sessionId);

          if (sessionStore) {
            await new Promise<void>((resolve) => {
              sessionStore.destroy(activeSession.sessionId, (err: any) => {
                if (err) {
                  console.error("Failed to destroy session:", err);
                }
                resolve();
              });
            });
          }
        })
      );

      storage
        .createSystemLog({
          eventType: "sessions_force_disconnected",
          userId: req.user?.id,
          username: req.user?.username,
          serviceUserInitials: null,
          details: {
            action: "Disconnected all non-admin sessions",
            target: "active_sessions",
            status: "Success",
            disconnected: sessions.length,
          },
        })
        .catch(() => {});

      return res.json({
        message: "All non-admin sessions disconnected",
        disconnected: sessions.length,
      });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to disconnect sessions") });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM LOG ROUTES  →  server/routes/systemLogs.ts
  // ═══════════════════════════════════════════════════════════════════════════
  registerSystemLogRoutes(app, { requireAuth, requireAdmin, blockDemoWrites });

  // ===== CARE WORKER ROTA ROUTES =====

  const templateRecommendationQuerySchema = z.object({
    workerKey: z.string().min(1),
    templateWeek: z.enum(["week1", "week2"]),
    templateDay: rotaWeekdayEnum,
  });

  const templateRecommendationSchema = templateRecommendationQuerySchema.extend({
    groupKey: z.string().min(1),
  });

  const templateRecommendationDeleteSchema = templateRecommendationQuerySchema.extend({
    groupKeys: z.array(z.string()).default([]),
  });

  // Save care worker rota (admin only)
  app.post("/api/admin/care-worker-rotas", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const payload = careWorkerRotaPayloadSchema.parse(req.body);
      const sourceHash = computeRotaSourceHash(payload);

      const { rota, deduped } = await storage.upsertCareWorkerRota({
        workerName: payload.workerName,
        workerKey: payload.workerKey,
        templateWeek: payload.templateWeek,
        templateDay: payload.templateDay,
        payload,
        sourceHash,
        createdBy: req.user?.id ?? null,
        createdByUsername: req.user?.username ?? null,
      });

      return res.status(201).json({ rota, deduped });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create rota") });
    }
  });

  // Get care worker rotas (admin only)
  app.get("/api/admin/care-worker-rotas", requireAuth, requireAdmin, async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const rotas = await storage.getCareWorkerRotas({ search });
      return res.json(rotas);
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load rotas") });
    }
  });

  // Get a specific care worker rota (admin only)
  app.get("/api/admin/care-worker-rotas/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const rota = await storage.getCareWorkerRotaById(req.params.id);
      if (!rota) {
        return res.status(404).json({ message: "Rota not found" });
      }
      return res.json(rota);
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load rota") });
    }
  });

  // Geocode an address (admin only, cached)
  app.get("/api/admin/geocode", requireAuth, requireAdmin, async (req, res) => {
    try {
      const address = typeof req.query.address === "string" ? req.query.address.trim() : "";
      if (!address) {
        return res.status(400).json({ message: "Address is required" });
      }
      if (address.length > 240) {
        return res.status(400).json({ message: "Address is too long" });
      }

      const result = await geocodeAddress(address);
      return res.json({ address, result });
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to geocode address") });
    }
  });

  // Update an existing care worker rota (admin only)
  app.put("/api/admin/care-worker-rotas/:id", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const existing = await storage.getCareWorkerRotaById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Rota not found" });
      }

      const payload = careWorkerRotaPayloadSchema.parse(req.body);
      const sourceHash = computeRotaSourceHash(payload);

      // If the new hash already exists on a different record, surface that record instead of erroring.
      const duplicate = await storage.getCareWorkerRotaByHash(sourceHash);
      if (duplicate && duplicate.id !== existing.id) {
        return res.json({ rota: duplicate, deduped: true, updated: false });
      }

      // If nothing changed, return existing
      if (existing.sourceHash === sourceHash) {
        return res.json({ rota: existing, deduped: false, updated: false });
      }

      const updated = await storage.updateCareWorkerRota(req.params.id, {
        workerName: payload.workerName,
        workerKey: payload.workerKey,
        templateWeek: payload.templateWeek,
        templateDay: payload.templateDay,
        payload,
        sourceHash,
        // preserve original creator fields if present
        createdBy: existing.createdBy ?? null,
        createdByUsername: existing.createdByUsername ?? null,
      });

      return res.json({ rota: updated, deduped: false, updated: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update rota") });
    }
  });

  // ===== ROSTERING TEMPLATE RECOMMENDATIONS =====

  app.get("/api/admin/rostering-recommendations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const query = {
        workerKey: typeof req.query.workerKey === "string" ? req.query.workerKey : "",
        templateWeek: typeof req.query.templateWeek === "string" ? req.query.templateWeek : "",
        templateDay: typeof req.query.templateDay === "string" ? req.query.templateDay : "",
      };
      const parsed = templateRecommendationQuerySchema.parse(query);
      const recommendations = await storage.getRosteringTemplateRecommendations(parsed);
      return res.json({ groupKeys: recommendations.map((rec) => rec.groupKey) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load recommendations") });
    }
  });

  app.post("/api/admin/rostering-recommendations", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const payload = templateRecommendationSchema.parse(req.body);
      const recommendation = await storage.upsertRosteringTemplateRecommendation({
        ...payload,
        createdBy: req.user?.id ?? null,
        createdByUsername: req.user?.username ?? null,
      });
      return res.status(201).json({ recommendation, deduped: !recommendation });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create recommendation") });
    }
  });

  app.delete("/api/admin/rostering-recommendations", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const payload = templateRecommendationDeleteSchema.parse(req.body);
      const deletedCount = await storage.deleteRosteringTemplateRecommendations(payload);
      return res.json({ deletedCount });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete recommendations") });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POLICY DOCUMENT ROUTES  →  server/routes/policyDocuments.ts
  // ═══════════════════════════════════════════════════════════════════════════
  registerPolicyDocumentRoutes(app, { requireAuth, requireAdmin, upload, scanAndLogFile, extractPdfTextWithPdfjs });

  // ===== AI AUDIT ROUTES =====

  const getAIProviderReadiness = async () => {
    const provider = getPreferredProvider();
    const hasOpenAIKey = !!(process.env.OPENAI_FALLBACK_API_KEY || process.env.OPENAI_API_KEY || process.env.PAT_AI_KEY);
    const hasPATKey = !!process.env.PAT_AI_KEY;
    const localLLMUrl = getLocalLLMUrl();
    const hasLocalLLM = await isLocalLLMAvailable();

    let providerConfigured = false;
    let providerIssue: string | null = null;

    if (provider === "openai") {
      providerConfigured = hasOpenAIKey;
      if (!providerConfigured) {
        providerIssue = "OpenAI provider is selected but no API key is configured (OPENAI_API_KEY, OPENAI_FALLBACK_API_KEY, or PAT_AI_KEY).";
      }
    } else if (provider === "github") {
      providerConfigured = hasPATKey;
      if (!providerConfigured) {
        providerIssue = "GitHub provider is selected but PAT_AI_KEY is not configured.";
      }
    } else if (provider === "local") {
      providerConfigured = hasLocalLLM;
      if (!providerConfigured) {
        providerIssue = `Local provider is selected but no local LLM is reachable at ${localLLMUrl}.`;
      }
    }

    return {
      provider,
      hasOpenAIKey,
      hasPATKey,
      hasLocalLLM,
      localLLMUrl,
      providerConfigured,
      providerIssue,
    };
  };

  // Security lockdown: block model-backed AI routes when AI is disabled.
  // Keep deterministic preflight, status checks, and endpoints with rule-based
  // fallbacks available so they can degrade gracefully.
  const AI_DISABLED_PASSTHROUGH = new Set([
    "/analyze-emar/preflight",
    "/status",
    "/chat",
    "/analyze-risks",
    "/generate-risk-assessment",
    "/generate-care-plan",
    "/enhance-plan",
  ]);
  app.use("/api/ai", requireAuth, (req, res, next) => {
    if (AI_DISABLED_PASSTHROUGH.has(req.path)) return next();
    if (isAIEnabled()) return next();
    return res.status(503).json({ code: "AI_DISABLED", message: getAIDisabledMessage() });
  });

  app.get("/api/ai/status", requireAuth, async (req, res) => {
    try {
      const aiEnabled = isAIEnabled();
      const readiness = await getAIProviderReadiness();
      const available = aiEnabled && readiness.providerConfigured;
      const message = !aiEnabled
        ? getAIDisabledMessage()
        : readiness.providerIssue;

      return res.json({
        available,
        aiEnabled,
        message,
        provider: readiness.provider,
        providerConfigured: readiness.providerConfigured,
      });
    } catch (error: any) {
      console.error("AI status fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to check AI status") });
    }
  });

  // Parse PDF or Word document and extract text
  app.post("/api/parse-pdf", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Virus scan the uploaded file
      const user = await storage.getUser(req.session.userId!);
      const scanCheck = await scanAndLogFile(req.file, "parse-pdf", user?.username);
      if (!scanCheck.allowed) {
        return res.status(400).json({ message: scanCheck.error });
      }

      const lowerName = req.file.originalname.toLowerCase();
      const isPdf = req.file.mimetype === "application/pdf" || lowerName.endsWith(".pdf");
      const isDocx =
        req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        lowerName.endsWith(".docx");
      const isDoc = (req.file.mimetype === "application/msword" || lowerName.endsWith(".doc")) && !isDocx;

      let text = "";

      if (isDocx) {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value || "";

        // Some DOCX files (esp. exported/scanned or heavily formatted) can yield empty output in mammoth.
        // Fallback: convert DOCX -> PDF (LibreOffice) and extract via pdf.js.
        if (!text.trim()) {
          const pdfBuffer = await tryConvertOfficeToPdf(req.file.buffer, req.file.originalname);
          if (pdfBuffer) {
            const extracted = await extractPdfTextWithPdfjs(pdfBuffer);
            text = extracted.text || "";
          }
        }
      } else if (isDoc) {
        const pdfBuffer = await tryConvertOfficeToPdf(req.file.buffer, req.file.originalname);
        if (!pdfBuffer) {
          return res.status(422).json({
            message:
              "Could not convert .doc file for text extraction. Please save/export the document as PDF or DOCX and try again.",
          });
        }
        const extracted = await extractPdfTextWithPdfjs(pdfBuffer);
        text = extracted.text || "";
      } else if (isPdf) {
        const extracted = await extractPdfTextWithPdfjs(req.file.buffer);
        text = extracted.text || "";
      } else {
        return res.status(400).json({ message: "Unsupported file type" });
      }

      if (!text || !text.trim()) {
        return res.status(422).json({
          message:
            "No readable text could be extracted from this document. If it is a scanned image, please upload a text-based PDF (with selectable text) or run OCR before uploading.",
        });
      }

      res.json({ text });
    } catch (error: any) {
      console.error("Document parsing error:", error);
      res.status(500).json({ message: "Failed to parse document" });
    }
  });

  // Analyze EMAR document using AI-based extraction with streaming progress
  app.post("/api/ai/analyze-emar/preflight", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        return res.status(400).json({ message: "Only PDF files are supported" });
      }

      if (!req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ message: "File upload failed - please try again" });
      }

      const user = req.user ?? await storage.getUser(req.session.userId!);
      const scanCheck = await scanAndLogFile(req.file, "emar-preflight", user?.username);
      if (!scanCheck.allowed) {
        return res.status(400).json({ message: scanCheck.error });
      }

      const grid = await parseEMARGrid(req.file.buffer);
      const warnings: string[] = [];
      const fileSizeMb = Number((req.file.size / (1024 * 1024)).toFixed(1));

      if (fileSizeMb > 30) {
        warnings.push("Large file detected. Analysis may take longer than usual.");
      }
      if ((grid.medications || []).length === 0) {
        warnings.push("No medications detected in the grid parser preflight.");
      }
      if ((grid.dates || []).length === 0) {
        warnings.push("No dates detected in the grid parser preflight.");
      }
      if ((grid.timeSlots || []).length === 0) {
        warnings.push("No time slots detected in the grid parser preflight.");
      }

      return res.json({
        ok: true,
        fileName: req.file.originalname,
        fileSizeMb,
        pageCount: grid.pageCount,
        medicationCount: (grid.medications || []).length,
        dateCount: (grid.dates || []).length,
        timeSlotCount: (grid.timeSlots || []).length,
        cellCount: (grid.cells || []).length,
        warnings,
      });
    } catch (error: any) {
      console.error("EMAR preflight error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Preflight failed") });
    }
  });

  // STRICT structured output compliance checking endpoint
  app.post("/api/ai/emar-compliance-check", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        return res.status(400).json({ message: "Only PDF files are supported" });
      }

      const extracted = await extractPdfTextWithPdfjs(req.file.buffer);
      const text = extracted.text || "";
      if (!text || text.length < 10) {
        return res.status(422).json({ message: "No readable text extracted from PDF. Is it a scanned image?" });
      }

      const aiUserContext = {
        userId: req.user?.id || 1,
        username: req.user?.username || "admin"
      };

      const result = await runComplianceAgent(text, aiUserContext);
      res.json(result);
    } catch (err: any) {
      console.error("Strict Compliance Agent error:", err);
      res.status(500).json({ message: err.message || "Failed to run strict compliance agent" });
    }
  });

  // Analyze EMAR document using AI-based extraction with streaming progress
  app.post("/api/ai/analyze-emar", requireAuth, upload.single("file"), async (req, res) => {
    // Force the known-good legacy pipeline.
    const emarMode = "legacy" as const;

    // Validate file BEFORE setting up streaming (must happen before flushHeaders)
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    
    const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return res.status(400).json({ message: "Only PDF files are supported" });
    }
    
    // Check buffer is not empty (can happen if upload interrupted)
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ message: "File upload failed - please try again" });
    }

    // Virus scan the uploaded file
    const user = req.user ?? await storage.getUser(req.session.userId!);
    const scanCheck = await scanAndLogFile(req.file, "emar-analysis", user?.username);
    if (!scanCheck.allowed) {
      return res.status(400).json({ message: scanCheck.error });
    }
    
    const allowSensitiveParam = String((req as any)?.body?.allowSensitive || "").toLowerCase();
    const allowSensitiveView =
      ["1", "true", "yes", "on"].includes(allowSensitiveParam) && user?.role === "admin";

    // User context for AI cost tracking
    const aiUserContext: AiUserContext = {
      userId: user?.id != null ? String(user.id) : null,
      username: user?.username != null ? String(user.username) : null,
    };
    const emarPrimaryModel = getAccurateModel();
    const emarMetadataModel = emarPrimaryModel;
    const emarExtractionModel = emarPrimaryModel;
    const emarValidationModel = emarPrimaryModel;
    
    // PII Vault for reversible scrubbing - caches original values locally
    const emarPIIVault = new PIIVault();
    
    // Set up SSE streaming response headers (after file is validated)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.flushHeaders();

    // Heartbeat to keep connection alive during long AI processing
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
        if (typeof (res as any).flush === 'function') (res as any).flush();
      } catch (e) {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    }, 10000);
    
    // Helper to send SSE events with 4KB padding to push through proxy buffers
    const sendEvent = (eventType: string, data: any) => {
      try {
        const padding = `: ${'x'.repeat(4096)}\n\n`;
        const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(padding + payload);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (e) {
        console.error('[EMAR SSE] Write error:', e);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    };
    
    // Helper to send progress updates
    const sendProgress = (percent: number, status: string, stage: string) => {
      console.log(`[EMAR SSE] Progress: ${percent}% - ${status}`);
      sendEvent('progress', { percent, status, stage });
    };
    
    // Helper: Resolve care worker initials to display name based on privacy settings
    async function resolveCareWorkerName(
      initials: string | undefined,
      allowSensitiveView: boolean
    ): Promise<string> {
      if (!initials || initials.trim() === "") {
        return "N.N."; // No initials = call documentation not completed
      }

      const splitNames = String(initials)
        .split(/[;,/|]+/)
        .map((part) => part.trim())
        .filter(Boolean);

      const unknownTokens = new Set(["unknown", "n.n.", "n.n", "nn", "n/a", "na", "not recorded"]);
      const normalizeToken = (token: string) => token.trim().toLowerCase();

      if (splitNames.length > 1) {
        const resolved = await Promise.all(
          splitNames.map(async (token) => {
            if (!token || unknownTokens.has(normalizeToken(token))) return token || "N.N.";
            if (!allowSensitiveView) return token;
            try {
              const worker = await storage.getCareWorkerByInitials(token);
              return worker?.name || token;
            } catch {
              return token;
            }
          })
        );
        return Array.from(new Set(resolved.filter(Boolean))).join(", ") || "N.N.";
      }
      
      if (!allowSensitiveView) {
        return initials; // Privacy mode - show only initials
      }
      
      // Allow sensitive view - try to get full name from database
      try {
        const worker = await storage.getCareWorkerByInitials(initials);
        return worker?.name || initials; // Full name if mapped, otherwise initials
      } catch {
        return initials; // Fallback to initials on error
      }
    }

    const UNKNOWN_CARE_WORKER_VALUES = new Set([
      "",
      "unknown",
      "n.n.",
      "n.n",
      "nn",
      "n/a",
      "na",
      "not recorded",
      "not available",
    ]);

    const normalizeWorkerValue = (value: unknown): string => String(value || "").trim();

    const isUnknownCareWorker = (value: unknown): boolean =>
      UNKNOWN_CARE_WORKER_VALUES.has(normalizeWorkerValue(value).toLowerCase());

    const splitWorkerNames = (value: unknown): string[] =>
      normalizeWorkerValue(value)
        .split(/[;,/|]+/)
        .map((part) => part.trim())
        .filter(Boolean);

    const buildCareWorkerInferenceIndex = (
      entries: any[],
      pickName: (entry: any) => unknown
    ): Map<string, Set<string>> => {
      const index = new Map<string, Set<string>>();
      (entries || []).forEach((entry) => {
        const date = normalizeWorkerValue(entry?.date).toLowerCase();
        const timeSlot = normalizeWorkerValue(entry?.timeSlot).toLowerCase();
        if (!date || !timeSlot) return;

        const key = `${date}|${timeSlot}`;
        const known = splitWorkerNames(pickName(entry)).filter((name) => !isUnknownCareWorker(name));
        if (!known.length) return;
        const bucket = index.get(key) || new Set<string>();
        known.forEach((name) => bucket.add(name));
        index.set(key, bucket);
      });
      return index;
    };

    const inferCareWorkerName = (
      currentName: unknown,
      date: unknown,
      timeSlot: unknown,
      inferenceIndex: Map<string, Set<string>>
    ): string => {
      const normalizedCurrent = normalizeWorkerValue(currentName);
      if (!isUnknownCareWorker(normalizedCurrent)) {
        return normalizedCurrent || "N.N.";
      }
      const key = `${normalizeWorkerValue(date).toLowerCase()}|${normalizeWorkerValue(timeSlot).toLowerCase()}`;
      const inferred = Array.from(inferenceIndex.get(key) || []).filter(Boolean);
      if (!inferred.length) return normalizedCurrent || "N.N.";
      return inferred.length === 1 ? inferred[0] : inferred.join(", ");
    };

    const applyCareWorkerInference = (
      items: any[],
      inferenceIndex: Map<string, Set<string>>
    ): any[] => {
      if (!Array.isArray(items) || items.length === 0) return items;
      return items.map((item) => {
        const date = item?.date || item?.dates?.[0]?.date || "";
        const timeSlot = item?.timeSlot || item?.dates?.[0]?.timeSlot || "";
        if (Object.prototype.hasOwnProperty.call(item || {}, "careWorkerName")) {
          return {
            ...item,
            careWorkerName: inferCareWorkerName(item?.careWorkerName, date, timeSlot, inferenceIndex),
          };
        }
        return item;
      });
    };

    const collectAllCareWorkers = (entries: any[], pickName: (entry: any) => unknown): string[] => {
      const workers = new Set<string>();
      (entries || []).forEach((entry) => {
        splitWorkerNames(pickName(entry))
          .filter((name) => !isUnknownCareWorker(name))
          .forEach((name) => workers.add(name));
      });
      return Array.from(workers).sort((a, b) => a.localeCompare(b));
    };

    const resolveCareWorkerList = async (workers: string[], allowSensitiveView: boolean): Promise<string[]> => {
      const resolved = await Promise.all(
        (workers || []).map((worker) => resolveCareWorkerName(worker, allowSensitiveView))
      );
      return Array.from(
        new Set(
          resolved
            .flatMap((value) => splitWorkerNames(value))
            .filter((name) => !isUnknownCareWorker(name))
        )
      ).sort((a, b) => a.localeCompare(b));
    };
    
    try {

      sendProgress(5, "Processing PDF...", "pdf_processing");

      // STEP 0: Deterministic grid scan (baseline check before AI)
      // This catches obvious non-admin codes that text/AI extraction might miss.
      let gridBaseline: ParsedEMAR | null = null;
      try {
        sendProgress(6, "Running quick grid scan...", "grid_scan");
        gridBaseline = await parseEMARGrid(req.file.buffer);
        console.log("[EMAR GRID BASELINE]", {
          dates: gridBaseline.dates?.length || 0,
          timeSlots: gridBaseline.timeSlots?.length || 0,
          medications: gridBaseline.medications?.length || 0,
          cells: gridBaseline.cells?.length || 0,
          debug: gridBaseline.debugInfo
        });
      } catch (gridError: any) {
        // Non-fatal: continue with AI pipeline.
        console.warn("[EMAR GRID BASELINE] Failed:", gridError?.message || gridError);
      }

      if (!gridBaseline || !Array.isArray(gridBaseline.cells) || gridBaseline.cells.length === 0) {
        sendEvent('warning', {
          message: "Unable to parse EMAR grid from PDF. Continuing with text-based extraction.",
          kind: "grid_fallback",
          userFacing: true,
        });
        gridBaseline = null;
      }

      // STEP 1: Extract text from PDF (primary method while Vision API unavailable)
      let extracted: Awaited<ReturnType<typeof extractPdfTextWithPdfjs>> | null = null;
      let documentText = "";
      let serviceUserFullName = "";
      try {
        // Reuse text extracted during the grid baseline pass (avoids parsing the PDF twice).
        if (
          gridBaseline &&
          Array.isArray(gridBaseline.pageTexts) &&
          gridBaseline.pageTexts.length > 0 &&
          typeof gridBaseline.rawText === "string" &&
          gridBaseline.rawText.trim().length > 0
        ) {
          extracted = {
            text: gridBaseline.rawText,
            pageCount: Number(gridBaseline.pageCount) || gridBaseline.pageTexts.length,
            pageCharCounts:
              Array.isArray(gridBaseline.pageCharCounts) &&
              gridBaseline.pageCharCounts.length === gridBaseline.pageTexts.length
                ? gridBaseline.pageCharCounts
                : gridBaseline.pageTexts.map((t) => (typeof t === "string" ? t.length : 0)),
            pageTexts: gridBaseline.pageTexts,
          };
        } else {
          extracted = await extractPdfTextWithPdfjs(req.file.buffer);
        }

        console.log(`DEBUG: PDF has ${extracted.pageCount} pages`);
        extracted.pageCharCounts.forEach((len, idx) => {
          console.log(`DEBUG: Page ${idx + 1} has ${len} chars`);
        });

        documentText = extracted.text;
        // Extract service user name BEFORE scrubbing (stored locally only, never sent to AI)
        serviceUserFullName =
          extractServiceUserFullName(documentText) ||
          extractServiceUserFullName(gridBaseline?.rawText || "");
        
        // Scrub PII from document text before any AI calls
        // The emarPIIVault caches original values locally for restoration
        documentText = emarPIIVault.scrubString(documentText);
        // Also scrub individual page texts used for chunked AI analysis
        if (extracted.pageTexts) {
          extracted.pageTexts = extracted.pageTexts.map(pt => emarPIIVault.scrubString(pt));
        }
        // Defense-in-depth: also scrub gridBaseline fields that contain raw PII
        // While gridBaseline data is mostly used for deterministic matching (not AI prompts),
        // scrubbing prevents any accidental PII leakage through the processing pipeline
        if (gridBaseline) {
          if (gridBaseline.rawText) {
            gridBaseline.rawText = emarPIIVault.scrubString(gridBaseline.rawText);
          }
          if (gridBaseline.pageTexts) {
            gridBaseline.pageTexts = gridBaseline.pageTexts.map(pt => emarPIIVault.scrubString(pt));
          }
          // Scrub cell content and careWorker names (may contain PII in freetext cells)
          if (gridBaseline.cells) {
            gridBaseline.cells = gridBaseline.cells.map(cell => ({
              ...cell,
              content: typeof cell.content === 'string' ? emarPIIVault.scrubString(cell.content) : cell.content,
              careWorker: typeof cell.careWorker === 'string' ? emarPIIVault.scrubString(cell.careWorker) : cell.careWorker,
            }));
          }
          // Scrub medication instructions (names are clinical terms and whitelisted)
          if (gridBaseline.medications) {
            gridBaseline.medications = gridBaseline.medications.map(med => ({
              ...med,
              instructions: typeof med.instructions === 'string' ? emarPIIVault.scrubString(med.instructions) : med.instructions,
            }));
          }
          // Note: gridBaseline.serviceUserName is only used via normalizeInitials() (safe)
          // but scrub it for completeness
          if (gridBaseline.serviceUserName) {
            gridBaseline.serviceUserName = emarPIIVault.scrubString(gridBaseline.serviceUserName);
          }
        }
        emarPIIVault.logAudit('SCRUB', '/api/ai/analyze-emar', aiUserContext.userId, aiUserContext.username);
        console.log(`DEBUG: Final extracted text: ${documentText.length} chars from PDF (pdfjs-dist), PII scrubbed (${emarPIIVault.getStats().total} items)`);
      } catch (textError: any) {
        console.error("PDF text extraction failed:", textError);
        sendEvent('error', { message: safeErrorMessage(textError, "Failed to extract text from PDF") });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      if (documentText.length < 100) {
        sendEvent('error', { message: "PDF appears to be empty or a scanned image. Please upload a text-based PDF document." });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
      
      // Maximum text length to send to AI. Keep conservative to remain compatible with smaller-context models
      // used in validation steps.
      const MAX_DOC_TEXT_LENGTH = 200000;
      const isDocumentTruncated = documentText.length > MAX_DOC_TEXT_LENGTH;

      const buildTextChunksFromPages = (pageTexts: string[], maxLen: number): string[] => {
        const chunks: string[] = [];
        let current: string[] = [];
        let currentLen = 0;

        const pushCurrent = () => {
          if (current.length === 0) return;
          chunks.push(current.join("\n\n--- PAGE BREAK ---\n\n"));
          current = [];
          currentLen = 0;
        };

        for (let i = 0; i < pageTexts.length; i++) {
          const pageNumber = i + 1;
          const pageText = pageTexts[i] || "";
          const pageBlock = `--- [PAGE ${pageNumber}/${pageTexts.length}] ---\n` + pageText;
          const additionalLen = pageBlock.length + (current.length > 0 ? "\n\n--- PAGE BREAK ---\n\n".length : 0);

          // If a single page is bigger than the max, split it.
          if (pageBlock.length > maxLen) {
            pushCurrent();
            let offset = 0;
            while (offset < pageBlock.length) {
              chunks.push(pageBlock.slice(offset, offset + maxLen));
              offset += maxLen;
            }
            continue;
          }

          if (currentLen + additionalLen > maxLen) {
            pushCurrent();
          }

          current.push(pageBlock);
          currentLen += additionalLen;
        }

        pushCurrent();
        return chunks.length > 0 ? chunks : [pageTexts.join("\n\n--- PAGE BREAK ---\n\n")];
      };

      if (isDocumentTruncated) {
        if (emarMode === "legacy") {
          console.warn(
            `WARNING: Document text exceeds ${MAX_DOC_TEXT_LENGTH} chars; legacy mode will chunk and scan the entire PDF.`
          );
          sendEvent('warning', {
            message: `Document is very large (${Math.round(documentText.length / 1000)}K chars). Legacy mode will scan the entire PDF in chunks to ensure full coverage.`
          });
        } else {
          console.warn(`WARNING: Document text truncated from ${documentText.length} to ${MAX_DOC_TEXT_LENGTH} chars. Some medications may be missed.`);
          sendEvent('warning', {
            message: `Document is very large (${Math.round(documentText.length / 1000)}K chars). Analyzing first ~200K characters. If medications are missing, try splitting the document.`
          });
        }
      }

      const legacyTextChunks = emarMode === "legacy"
        ? buildTextChunksFromPages(extracted?.pageTexts || [documentText], MAX_DOC_TEXT_LENGTH)
        : [];

      const analysisText = emarMode === "legacy"
        ? (legacyTextChunks[0] || documentText)
        : (isDocumentTruncated ? documentText.substring(0, MAX_DOC_TEXT_LENGTH) : documentText);
      
      // Note: Vision API image conversion disabled (pdf-poppler not available on this platform)
      const imageContent: any[] = [];
      const useTextMode = true;
      
      // =====================================================================
      // PRE-ANALYSIS: Regex-based extraction BEFORE AI to validate AI results
      // =====================================================================
      sendProgress(5, "Pre-analyzing document structure...", "pre_analysis");
      
      // Extract dates from column headers using regex
      // Common EMAR date formats: "Sun, 30 Nov", "Mon, 01 Dec", "Tue 02 Dec", "30/11", "01/12"
      const preAnalysis = {
        dates: [] as string[],
        dateCount: 0,
        timeSlots: [] as string[],
        medicationLines: 0,
        rawDateMatches: [] as string[],
        tableHeaderLines: [] as string[],
      };
      
      // Pattern 1: Day abbreviation with comma, day number, month (e.g., "Sun, 30 Nov", "Mon, 01 Dec")
      const datePattern1 = /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[,.]?\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi;
      // Pattern 2: Day number with month name (e.g., "30 Nov", "01 Dec", "1 December")
      const datePattern2 = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi;
      // Pattern 3: Full date format (e.g., "30/11/2024", "01-12-2024")
      const datePattern3 = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
      
      // =====================================================================
      // NEW APPROACH: Only extract dates from TABLE HEADER lines
      // An EMAR table header has MULTIPLE dates on the same line (e.g., 7 days)
      // Isolated dates like "Printed on 15 Dec 2024" should be ignored
      // =====================================================================
      
      const lines = analysisText.split(/\r?\n/);
      const foundDates = new Set<string>();
      let match;
      
      // Function to count dates in a single line
      const countDatesInLine = (line: string): { count: number; dates: string[] } => {
        const dates: string[] = [];
        
        // Reset regex lastIndex for each line
        const p1 = new RegExp(datePattern1.source, 'gi');
        const p2 = new RegExp(datePattern2.source, 'gi');
        
        // Count Pattern 1 matches (e.g., "Sun, 30 Nov")
        let m;
        while ((m = p1.exec(line)) !== null) {
          const normalizedDate = `${m[1]}, ${m[2].padStart(2, '0')} ${m[3]}`;
          dates.push(normalizedDate);
        }
        
        // Count Pattern 2 matches that aren't already captured by Pattern 1
        while ((m = p2.exec(line)) !== null) {
          const normalizedDate = `${m[1].padStart(2, '0')} ${m[2]}`;
          const existsInPattern1 = dates.some(d => d.includes(normalizedDate));
          if (!existsInPattern1) {
            dates.push(normalizedDate);
          }
        }
        
        return { count: dates.length, dates };
      };
      
      // Strategy 1: Find lines with MULTIPLE dates (2+ dates = likely table header)
      const tableHeaderLineIndices: number[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const { count, dates } = countDatesInLine(lines[i]);
        if (count >= 2) {
          // This line has 2+ dates - likely a table header row
          tableHeaderLineIndices.push(i);
          preAnalysis.tableHeaderLines.push(lines[i].substring(0, 150) + (lines[i].length > 150 ? '...' : ''));
          dates.forEach(d => {
            foundDates.add(d);
            preAnalysis.rawDateMatches.push(d);
          });
        }
      }
      
      // Strategy 2: If no multi-date lines found, look for consecutive single-date lines
      // (Some EMARs may have each date on its own line in a vertical header)
      if (tableHeaderLineIndices.length === 0) {
        console.log("DEBUG: No multi-date lines found, checking for consecutive date clusters...");
        
        // Find clusters of consecutive lines that each contain at least one date
        let clusterStart = -1;
        let clusterDates: string[] = [];
        let tempClusterLines: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const { count, dates } = countDatesInLine(lines[i]);
          
          if (count >= 1) {
            if (clusterStart === -1) {
              clusterStart = i;
              clusterDates = [...dates];
              tempClusterLines = [lines[i].substring(0, 150)];
            } else {
              clusterDates.push(...dates);
              tempClusterLines.push(lines[i].substring(0, 150));
            }
          } else {
            // End of cluster - check if it's significant (3+ consecutive lines with dates)
            if (clusterStart !== -1 && clusterDates.length >= 3) {
              console.log(`DEBUG: Found date cluster from lines ${clusterStart} to ${i - 1} with ${clusterDates.length} dates`);
              clusterDates.forEach(d => {
                foundDates.add(d);
                preAnalysis.rawDateMatches.push(d);
              });
              preAnalysis.tableHeaderLines.push(...tempClusterLines);
            }
            clusterStart = -1;
            clusterDates = [];
            tempClusterLines = [];
          }
        }
        
        // Check final cluster if document ends with dates
        if (clusterStart !== -1 && clusterDates.length >= 3) {
          console.log(`DEBUG: Found date cluster at end with ${clusterDates.length} dates`);
          clusterDates.forEach(d => {
            foundDates.add(d);
            preAnalysis.rawDateMatches.push(d);
          });
          preAnalysis.tableHeaderLines.push(...tempClusterLines);
        }
      }
      
      // FALLBACK: If still no dates found via table header detection, 
      // fall back to original behavior but log a warning
      if (foundDates.size === 0) {
        console.log("WARNING: No table header dates detected. Falling back to scanning entire document.");
        
        // Original scanning logic as fallback
        while ((match = datePattern1.exec(analysisText)) !== null) {
          const normalizedDate = `${match[1]}, ${match[2].padStart(2, '0')} ${match[3]}`;
          foundDates.add(normalizedDate);
          preAnalysis.rawDateMatches.push(match[0]);
        }
        
        // Reset and extract using Pattern 2 (backup)
        datePattern2.lastIndex = 0;
        while ((match = datePattern2.exec(analysisText)) !== null) {
          const normalizedDate = `${match[1].padStart(2, '0')} ${match[2]}`;
          const existsInPattern1 = Array.from(foundDates).some(d => d.includes(normalizedDate));
          if (!existsInPattern1) {
            foundDates.add(normalizedDate);
          }
        }
      }
      
      preAnalysis.dates = Array.from(foundDates);
      preAnalysis.dateCount = preAnalysis.dates.length;
      
      // Extract time slots (e.g., "08:00-09:00", "20:30-21:00", or just "08:00")
      const timePattern = /\b(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\b/g;
      const foundTimeSlots = new Set<string>();
      while ((match = timePattern.exec(analysisText)) !== null) {
        if (match[2]) {
          foundTimeSlots.add(`${match[1]}-${match[2]}`);
        } else {
          // Single time - likely a slot marker
          foundTimeSlots.add(match[1]);
        }
      }
      preAnalysis.timeSlots = Array.from(foundTimeSlots).slice(0, 10); // Limit to reasonable number
      
      // Count lines that look like medication entries (contain mg, mcg, ml, tablet, capsule, etc.)
      const medicationLinePattern = /^.*\b(\d+\s*(mg|mcg|ml|g|tablet|capsule|patch|spray|drop|unit|iu)s?)\b.*$/gim;
      const medMatches = analysisText.match(medicationLinePattern);
      preAnalysis.medicationLines = medMatches ? medMatches.length : 0;
      
      // Log pre-analysis summary
      console.log("=== EMAR PRE-ANALYSIS SUMMARY ===");
      console.log(`Dates found (regex): ${preAnalysis.dateCount}`);
      console.log(`Date values: ${preAnalysis.dates.join(', ')}`);
      console.log(`Table header lines identified: ${preAnalysis.tableHeaderLines.length}`);
      if (preAnalysis.tableHeaderLines.length > 0) {
        console.log("Table header samples:");
        preAnalysis.tableHeaderLines.slice(0, 3).forEach((line, i) => {
          console.log(`  ${i + 1}: ${line}`);
        });
      }
      console.log(`Time slots found: ${preAnalysis.timeSlots.length}`);
      console.log(`Medication-like lines: ${preAnalysis.medicationLines}`);
      console.log(`Raw date matches: ${preAnalysis.rawDateMatches.slice(0, 15).join(', ')}`);
      console.log("=================================");
      
      // TABLE STRUCTURE DETECTION - Run before AI extraction to identify EMAR grid layout
      const tableStructure = detectTableStructure(analysisText);
      
      console.log("=== TABLE STRUCTURE DETECTION ===");
      console.log(`Has table: ${tableStructure.hasTable}`);
      console.log(`Table type: ${tableStructure.tableType}`);
      console.log(`Dates on same line: ${tableStructure.detectedDatesOnSameLine}`);
      console.log(`Column count: ${tableStructure.columns.length}`);
      if (tableStructure.columns.length > 0) {
        console.log(`Columns: ${tableStructure.columns.slice(0, 10).join(', ')}${tableStructure.columns.length > 10 ? '...' : ''}`);
      }
      console.log(`Detected time slots: ${tableStructure.detectedTimeSlots.join(', ')}`);
      console.log(`Medication row count: ${tableStructure.rowCount}`);
      console.log(`Column boundaries: ${tableStructure.columnBoundaries.join(', ')}`);
      console.log("=================================");
      
      // Fetch recent EMAR corrections to improve AI extraction accuracy
      let recentCorrections: any[] = [];
      if (process.env.DATABASE_URL) {
        try {
          recentCorrections = await storage.getRecentEmarCorrections(20);
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("EMAR corrections lookup failed in development; continuing without history.");
          } else {
            throw error;
          }
        }
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("DATABASE_URL not set - skipping EMAR corrections history");
      }
      let correctionsContext = '';
      if (recentCorrections.length > 0) {
        const correctionExamples = recentCorrections.map(c => {
          const codeChange = c.correctedCode 
            ? `${c.originalCode || 'blank'} → ${c.correctedCode}`
            : 'no code change';
          return `- "${c.originalMedication}" on ${c.originalDate}: ${codeChange}`;
        }).join('\n');
        correctionsContext = `
LEARN FROM PAST CORRECTIONS:
The following are corrections made to previous extractions. Use these to improve accuracy:
${correctionExamples}
`;
        console.log(`DEBUG: Loaded ${recentCorrections.length} past corrections for AI context`);
      }
      
      sendProgress(10, "Analyzing EMAR document...", "metadata_extraction");

      // =====================================================================
      // USE EMAR AGENT (enabled by default, configurable via admin portal)
      // =====================================================================
      const useEmarAgentEnabled = getUseEmarAgent();
      let agentExtractionSucceeded = false;
      let agentExtractedData: any = null;
      let agentDrugInteractions: any[] = [];
      
      if (useEmarAgentEnabled) {
        console.log("=== USING EMAR AGENT (GPT-5.2) ===");
        sendProgress(15, "Using thorough EMAR agent...", "emar_agent");
        
        // Simulated progress during EMAR agent processing
        let simulatedProgress = 15;
        progressInterval = setInterval(() => {
          if (simulatedProgress < 55) {
            simulatedProgress += 5;
            const messages = [
              "Extracting medication entries...",
              "Parsing administration times...",
              "Identifying staff codes...",
              "Validating entry data...",
              "Cross-referencing medications...",
              "Building EMAR structure...",
            ];
            const msgIndex = Math.floor((simulatedProgress - 15) / 7) % messages.length;
            sendProgress(simulatedProgress, messages[msgIndex], "emar_agent");
          }
        }, 4000);
        
        try {
          const agentText = documentText;
          const agentResult = await emarAgent.extract(
            agentText,
            tableStructure,
            correctionsContext,
            aiUserContext,
            { gridBaseline }
          );
          
          if (progressInterval) clearInterval(progressInterval);
          console.log(`EMAR Agent completed: ${agentResult.entries.length} entries, ${agentResult.consensusStatus}, validation: ${agentResult.validationPassed}`);
          sendProgress(60, `Extracted ${agentResult.entries.length} entries via agent...`, "agent_complete");
          
          // Convert agent result to the format expected by the rest of the code
          const metadata = agentResult.metadata;
          const gridInitials = normalizeInitials(gridBaseline?.serviceUserName);
          const textInitials = normalizeInitials(serviceUserFullName);
          const aiInitials = normalizeInitials(metadata.serviceUserInitials);
          const derivedAgentInitials =
            gridInitials !== "N.N."
              ? gridInitials
              : textInitials !== "N.N."
                ? textInitials
                : aiInitials;
          metadata.serviceUserInitials = derivedAgentInitials;
          const allEntries = agentResult.entries.map((e: any) => ({
            ...e,
            medication: metadata.medications.find((m: any) => m.medicationId === e.medicationId)?.name || `Medication ${e.medicationId}`
          }));
          
          // Check for drug interactions
          sendProgress(62, "Checking for drug interactions...", "drug_interaction_check");
          agentDrugInteractions = await checkDrugInteractions(metadata.medications, aiUserContext);
          if (agentDrugInteractions.length > 0) {
            const highSeverity = agentDrugInteractions.filter(d => d.severity === 'high').length;
            if (highSeverity > 0) {
              sendEvent('warning', { 
                message: `ALERT: ${highSeverity} high-severity drug interaction(s) detected. Review medications carefully.`
              });
            }
          }
          
          // Store extracted data for discrepancy analysis
          agentExtractedData = {
            serviceUserInitials: metadata.serviceUserInitials,
            allergies: metadata.allergies,
            medications: metadata.medications,
            dates: metadata.dates,
            timeSlots: metadata.timeSlots,
            entries: allEntries,
            drugInteractions: agentDrugInteractions,
            consensusStatus: agentResult.consensusStatus,
            model: agentResult.model
          };
          
          agentExtractionSucceeded = true;
          console.log("EMAR Agent extraction succeeded - running discrepancy analysis on agent data");
          
          // =====================================================================
          // AGENT PATH: DISCREPANCY ANALYSIS
          // =====================================================================
          sendProgress(70, "Analyzing for discrepancies...", "agent_discrepancy_analysis");
          
          const agentEntries = agentExtractedData.entries;
          const agentMedications = agentExtractedData.medications;
          const agentDates = agentExtractedData.dates;
          const agentTimeSlots = agentExtractedData.timeSlots;

          // Build PRN medication sets (prefer medicationId to avoid collisions on duplicate names)
          const agentMedicationNameById = new Map<number, string>();
          const agentPrnMeds = new Set<string>(); // fallback when entries lack medicationId
          const agentPrnMedIds = new Set<number>();
          agentMedications.forEach((m: any) => {
            const medId = Number(m.medicationId) || 0;
            if (medId) agentMedicationNameById.set(medId, m.name);
            if (m.isPRN) {
              if (m?.name) agentPrnMeds.add(m.name);
              if (medId) agentPrnMedIds.add(medId);
            }
          });

          // Early service-user level inference for code validation (non-PRN meds only).
          const earlyLevelCounts = { AD: 0, AS: 0, P: 0 };
          agentEntries.forEach((entry: any) => {
            const code = String(entry.code || "").toUpperCase();
            const medId = Number(entry.medicationId) || 0;
            const isPRN = (medId > 0 && agentPrnMedIds.has(medId)) || agentPrnMeds.has(entry.medication);
            if (isPRN) return;
            if (code === "AD") earlyLevelCounts.AD++;
            else if (code === "AS") earlyLevelCounts.AS++;
            else if (code === "P") earlyLevelCounts.P++;
          });
          const earlyTotal = earlyLevelCounts.AD + earlyLevelCounts.AS + earlyLevelCounts.P;
          let agentServiceUserTypeEarly: "administer" | "assist" | "prompt" = "prompt";
          if (earlyTotal > 0) {
            const adRatio = earlyLevelCounts.AD / earlyTotal;
            const asRatio = earlyLevelCounts.AS / earlyTotal;
            if (adRatio > 0.6) agentServiceUserTypeEarly = "administer";
            else if (asRatio > 0.4) agentServiceUserTypeEarly = "assist";
          }
          
          const normalizeAgentCode = (raw: unknown): string => {
            if (!raw) return "";
            let code = String(raw)
              .toUpperCase()
              .trim()
              .replace(/[()\[\]{}]/g, "")
              .replace(/[–—]/g, "-")
              .replace(/\s+/g, "");

            if (!code) return "";
            if (code === "F" || code === "FA" || code === "FAMILY" || code === "FAM" || code === "F/A") return "F";
            if (code === "S/A" || code === "S-A") return "SA";
            if (code === "M/U" || code === "MU") return "MU";
            if (code === "N/H" || code === "NH") return "NH";
            if (code === "A/D") return "AD";
            if (code === "A/S") return "AS";
            if (code === "PRNAD" || code === "PRN-AD") return "PRN-AD";
            if (code === "PRNAS" || code === "PRN-AS") return "PRN-AS";
            if (
              code === "PRNR" ||
              code === "PRN-R" ||
              code === "PRNREFUSED" ||
              code === "PRNREFUS" ||
              code === "PRNREF" ||
              code === "PRNRF"
            ) {
              return "PRN-R";
            }
            if (code === "REFUSED" || code === "REFUSE" || code === "REF") return "R";
            if (code === "NA") return "N/A";
            return code;
          };
          
          // Build per-medication required gap lookup (prefer explicit instruction rules)
          const agentMedGapHoursById = new Map<number, number>();
          const agentMedGapHoursByName = new Map<string, number>(); // fallback
          agentMedications.forEach((m: any) => {
            const rawGap = Number(m?.requiredGapHours);
            const inferredGap = inferRequiredGapHoursFromText(`${m?.name || ""} ${m?.instructions || ""}`);
            const normalizedRaw =
              Number.isFinite(rawGap) && rawGap >= 1 && rawGap <= 24 ? rawGap : null;
            const gapHours =
              typeof inferredGap === "number" && Number.isFinite(inferredGap) && (normalizedRaw == null || normalizedRaw === 4)
                ? inferredGap
                : normalizedRaw ?? 4;
            const medId = Number(m.medicationId) || 0;
            if (m?.name) {
              agentMedGapHoursByName.set(m.name, gapHours);
            }
            if (medId) {
              agentMedGapHoursById.set(medId, gapHours);
            }
          });

          const agentDiscrepancies: any[] = [];
          const agentWarnings: any[] = [];
          const agentVerificationItems: any[] = [];

          if (gridBaseline && Array.isArray(gridBaseline.cells)) {
            const missingByMed = new Map<string, { count: number; medication: string; medicationId?: number; dates: Set<string> }>();
            gridBaseline.cells.forEach((cell) => {
              const code = String(cell.code || "").toUpperCase();
              if (code !== "MISSED") return;
              const medId = Number(cell.medicationId) || 0;
              const key = medId > 0 ? `id:${medId}` : `name:${cell.medication || ""}`;
              const existing = missingByMed.get(key) || {
                count: 0,
                medication: medId > 0 ? agentMedicationNameById.get(medId) || cell.medication || "" : cell.medication || "",
                medicationId: medId || undefined,
                dates: new Set<string>(),
              };
              existing.count += 1;
              if (cell.date) existing.dates.add(cell.date);
              missingByMed.set(key, existing);

              // Individual verification item for each MISSED entry
              const medName = medId > 0 ? agentMedicationNameById.get(medId) || cell.medication || "" : cell.medication || "";
              agentVerificationItems.push({
                careWorkerName: cell.careWorker || "N.N.",
                date: cell.date,
                medication: medName,
                medicationId: medId || undefined,
                code: "MISSED",
                note: "Check why the medication was missed and ensure it is documented",
              });
            });

            missingByMed.forEach(({ count, medication, medicationId, dates }) => {
              const dateList = Array.from(dates).slice(0, 5).join(", ");
              const dateSuffix = dateList ? ` (dates: ${dateList}${dates.size > 5 ? ", ..." : ""})` : "";
              agentWarnings.push({
                type: "missing_record",
                severity: "medium",
                medication,
                medicationId,
                description: `Records incomplete: ${count} missing entry${count === 1 ? "" : "ies"}${dateSuffix}.`,
                recommendedAction: "Confirm missing records and update administration logs",
              });
            });
          }
          
          // =====================================================================
          // NON-ADMINISTRATION DETECTION (codes requiring reason review)
          // R=Refused, NH=Not Home, MU=Medication Unavailable, PRN-R=PRN Refused
          // SA=Self Administered (every instance requires verification)
          // Family-administered (F) does not require verification.
          // =====================================================================
          const reviewCodes = ['R', 'PRN-R', 'NH', 'MU', 'SA'];
          const SA_TREND_THRESHOLD = 3;
          const mainRefusalDiscrepancies: any[] = [];
          const prnRefusalDiscrepancies: any[] = [];
          const saCountsByMedication = new Map<string, { count: number; medication: string; medicationId?: number }>();
          
          const getIssueDescription = (code: string, isPRN: boolean): string => {
            const prnPrefix = isPRN ? '(PRN) ' : '';
            switch (code) {
              case 'R':
              case 'PRN-R':
                return `Medication ${prnPrefix}refused by service user`;
              case 'NH':
                return `Medication ${prnPrefix}not given - service user not home`;
              case 'SA':
                return `Medication ${prnPrefix}self-administered by service user`;
              case 'F':
                return `Medication ${prnPrefix}administered by family member`;
              case 'MU':
                return `Medication ${prnPrefix}unavailable`;
              default:
                return `Medication ${prnPrefix}not administered - ${code}`;
            }
          };

          const getVerificationNote = (code: string, isPRN: boolean): string => {
            switch (code) {
              case 'R':
              case 'PRN-R':
                return isPRN
                  ? "Check if PRN refusal reason is documented and acceptable"
                  : "Check if refusal reason is documented and acceptable";
              case 'NH':
                return "Check if not home status is documented";
              case 'SA':
                return "Check if self-administration was appropriate and witnessed";
              case 'F':
                return "Check if family administration is documented and appropriate";
              case 'MU':
                return "Check if medication unavailability is documented and escalated";
              default:
                return "Check if this entry is documented appropriately";
            }
          };
          
          agentEntries.forEach((entry: any) => {
            const code = normalizeAgentCode(entry.code || "");
            if (code !== "SA") return;
            const medId = Number(entry.medicationId) || 0;
            const key = medId > 0 ? `id:${medId}` : `name:${entry.medication || ""}`;
            const existing = saCountsByMedication.get(key) || {
              count: 0,
              medication: medId > 0 ? agentMedicationNameById.get(medId) || entry.medication || "" : entry.medication || "",
              medicationId: medId || undefined,
            };
            existing.count += 1;
            saCountsByMedication.set(key, existing);
          });

          saCountsByMedication.forEach(({ count, medication, medicationId }) => {
            if (count >= SA_TREND_THRESHOLD) {
              agentWarnings.push({
                type: "self_administered_trend",
                severity: "medium",
                medication,
                medicationId,
                description: `Self-administered (SA) recorded ${count} times in the audit period`,
                recommendedAction: "Confirm self-administration is appropriate and documented",
              });
            }
          });

          agentEntries.forEach((entry: any) => {
            const code = normalizeAgentCode(entry.code || "");
            if (reviewCodes.includes(code)) {
              const medId = Number(entry.medicationId) || 0;
              const isPRN =
                (medId > 0 && agentPrnMedIds.has(medId)) ||
                agentPrnMeds.has(entry.medication) ||
                code.includes('PRN');
              const verificationItem = {
                careWorkerName: entry.careWorkerInitials || 'Unknown',
                date: entry.date,
                medication: entry.medication,
                medicationId: medId || undefined,
                code: code,
                note: getVerificationNote(code, isPRN)
              };
              agentVerificationItems.push(verificationItem);

              const refusalItem = {
                careWorkerName: entry.careWorkerInitials || 'Unknown',
                date: entry.date,
                timeSlot: entry.timeSlot,
                medication: entry.medication,
                medicationId: medId || undefined,
                code: code,
              };
              
              if (isPRN) {
                prnRefusalDiscrepancies.push(refusalItem);
              } else {
                mainRefusalDiscrepancies.push(refusalItem);
              }

              if (!isPRN && code === "R" && agentServiceUserTypeEarly === "prompt") {
                agentDiscrepancies.push({
                  careWorkerName: entry.careWorkerInitials || 'Unknown',
                  date: entry.date,
                  timeSlot: entry.timeSlot,
                  medication: entry.medication,
                  medicationId: medId || undefined,
                  issue: "Refused (R) code used on prompt-level medication; review support level and documentation",
                  severity: "medium",
                  actions: { performanceNote: true, meeting: "phone", referToManager: false },
                });
              }
            }

          });

          // =====================================================================
          // PRN CODE MISUSE + INVALID CODES (match legacy pipeline CHECK 5d/5e)
          // =====================================================================
          const PRN_CODES = ['PRN', 'PRN-AD', 'PRN-AS', 'PRN-R'];
          const INVALID_PRN_CODES = ['AD', 'AS', 'P'];
          const VALID_ADMIN_CODES = ['AD', 'AS', 'P', 'SA', 'NH', 'R', 'F', 'MU'];

          agentEntries.forEach((entry: any) => {
            const code = normalizeAgentCode(entry.code || "");
            if (!code) return;
            if (code === "MISSED") return;

            const careWorker = entry.careWorkerInitials || 'Unknown';
            const date = entry.date || '';
            const timeSlot = entry.timeSlot || '';
            const medication = entry.medication || '';

            const medId = Number(entry.medicationId) || 0;
            const isPRN = (medId > 0 && agentPrnMedIds.has(medId)) || agentPrnMeds.has(medication);

            // CHECK 5d (1): PRN-style codes on non-PRN meds
            if (PRN_CODES.includes(code) && !isPRN) {
              // PRN-R remains a verification item; avoid double-reporting.
              if (code !== 'PRN-R') {
                agentDiscrepancies.push({
                  careWorkerName: careWorker,
                  date,
                  timeSlot,
                  medication,
                  medicationId: medId || undefined,
                  code,
                  issue: `PRN code "${code}" used on regular medication - not prescribed as PRN`,
                  severity: "high",
                  actions: { performanceNote: true, meeting: "phone", referToManager: true }
                });
              }
              return;
            }

            // CHECK 5d (2): AD/AS/P used on PRN meds
            if (INVALID_PRN_CODES.includes(code) && isPRN) {
              agentDiscrepancies.push({
                careWorkerName: careWorker,
                date,
                timeSlot,
                medication,
                medicationId: medId || undefined,
                code,
                issue: `Invalid code "${code}" used on PRN medication - should use PRN codes (PRN, PRN-AD, PRN-AS, PRN-R)`,
                severity: "high",
                actions: { performanceNote: true, meeting: "phone", referToManager: false }
              });
              return;
            }

            // CHECK 5e: Invalid codes for administered (non-PRN) meds
            if (!isPRN && code && !VALID_ADMIN_CODES.includes(code)) {
              if (PRN_CODES.includes(code)) return; // already handled above
              if (code !== '' && code !== 'BLANK' && code !== 'EMPTY') {
                agentDiscrepancies.push({
                  careWorkerName: careWorker,
                  date,
                  timeSlot,
                  medication,
                  medicationId: medId || undefined,
                  code,
                  issue: `Invalid code "${code}" used on administered medication - valid codes are: AD, AS, P, SA, NH, R, F, MU`,
                  severity: "high",
                  actions: { performanceNote: true, meeting: "phone", referToManager: true }
                });
              }
            }
          });
          
          console.log(`Agent: Found ${mainRefusalDiscrepancies.length} main non-admin codes, ${prnRefusalDiscrepancies.length} PRN non-admin codes`);
          
          // =====================================================================
          // TIME GAP DETECTION (all administered medications with 2+ entries per day)
          // =====================================================================
          const administrationCodes = ['AD', 'PRN', 'PRN-AD', 'PRN-AS'];
          const medDateEntriesForGap = new Map<string, any[]>();
          const normalizeDateKey = (value: string): string =>
            String(value || "").toLowerCase().replace(/[,\s]+/g, "-").trim();
          const dateIndexByKey = new Map<string, number>();
          (agentDates || []).forEach((d: string, idx: number) => {
            const key = normalizeDateKey(d);
            if (key && !dateIndexByKey.has(key)) dateIndexByKey.set(key, idx);
          });

          const parseTimeToMinutes = (raw: string): number | null => {
            const match = String(raw || "").match(/\b(\d{1,2})(?:[:.]?([0-5]\d))?\s*(am|pm)?\b/i);
            if (!match) return null;
            let hours = Number(match[1]);
            const minutes = match[2] ? Number(match[2]) : 0;
            const meridiem = match[3]?.toLowerCase();
            if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
            if (meridiem) {
              if (hours === 12) hours = 0;
              if (meridiem === "pm") hours += 12;
            }
            if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
            return hours * 60 + minutes;
          };

          const extractTimeFromValue = (value: string): { minutes: number; display: string } | null => {
            const timeValue = String(value || "").trim();
            if (!timeValue) return null;
            const isRange = /\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}/.test(timeValue);
            if (isRange) return null;
            const tokenMatch = timeValue.match(/\b(?:0?[0-9]|1[0-9]|2[0-3])[:.]?[0-5][0-9](?:\s*(?:am|pm|AM|PM))?\b/);
            if (!tokenMatch) return null;
            const token = tokenMatch[0].replace(".", ":");
            const minutes = parseTimeToMinutes(token);
            if (minutes == null) return null;
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const display = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
            return { minutes, display };
          };

          const extractTimeFromSlot = (slot: string): { minutes: number; display: string } | null => {
            const slotValue = String(slot || "").trim();
            if (!slotValue) return null;
            const tokenMatch = slotValue.match(/\b(?:0?[0-9]|1[0-9]|2[0-3])[:.]?[0-5][0-9](?:\s*(?:am|pm|AM|PM))?\b/);
            if (!tokenMatch) return null;
            const token = tokenMatch[0].replace(".", ":");
            const minutes = parseTimeToMinutes(token);
            if (minutes == null) return null;
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const display = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
            return { minutes, display };
          };
          
          agentEntries.forEach((entry: any) => {
            const code = (entry.code || '').toUpperCase();
            if (!administrationCodes.some(c => code === c || code.startsWith(c))) return;
            
            // Skip office-closed entries from time gap checks (manually closed by office staff)
            if (entry.isOfficeClosed) {
              console.log(`DEBUG: Skipping office-closed entry from time gap check: ${entry.medication} on ${entry.date}`);
              return;
            }
            
            const entryMedId = Number(entry.medicationId) || 0;
            const entryMedication = entry.medication || "";
            const requiredGap =
              entryMedId > 0
                ? agentMedGapHoursById.get(entryMedId) || 4
                : agentMedGapHoursByName.get(entryMedication) || 4;
            // Only use explicit administration times recorded in the cell.
            const extracted = extractTimeFromValue(entry.time);
            if (!extracted) return;

            // Require care worker initials to avoid blank/crossed-out boxes
            const careWorkerInitials = (entry.careWorkerInitials || entry.careWorker || "").trim();
            if (!careWorkerInitials) return;
            
            // Normalize date for grouping
            const dateKey = normalizeDateKey(entry.date);
            const dateIndex = dateIndexByKey.get(dateKey) ?? -1;
            const medId = entryMedId;
            const medKey = medId > 0 ? `id:${medId}` : `name:${entryMedication}`;
            const key = `${medKey}|${dateKey}`;
            
            if (!medDateEntriesForGap.has(key)) medDateEntriesForGap.set(key, []);
            medDateEntriesForGap.get(key)!.push({
              ...entry,
              extractedTime: extracted.display,
              extractedMinutes: extracted.minutes,
              timeSource: "explicit",
              requiredGap,
              dateKey,
              dateIndex,
              isPRN:
                (medId > 0 && agentPrnMedIds.has(medId)) ||
                agentPrnMeds.has(entryMedication) ||
                code.includes("PRN")
            });
          });
          
          // Check time gaps
          medDateEntriesForGap.forEach((dayEntries, key) => {
            if (dayEntries.length < 2) return;
            
            const [medKeyPart] = key.split('|');
            const medId = medKeyPart.startsWith('id:') ? Number(medKeyPart.slice(3)) || 0 : 0;
            const medication =
              medId > 0
                ? agentMedicationNameById.get(medId) || dayEntries[0]?.medication || ''
                : medKeyPart.startsWith('name:')
                  ? medKeyPart.slice(5)
                  : dayEntries[0]?.medication || '';

            // Sort by time
            const sorted = dayEntries.sort((a: any, b: any) => {
              return (a.extractedMinutes || 0) - (b.extractedMinutes || 0);
            });
            
            for (let i = 1; i < sorted.length; i++) {
              const prev = sorted[i - 1];
              const curr = sorted[i];
              
              const gapHours = ((curr.extractedMinutes || 0) - (prev.extractedMinutes || 0)) / 60;
              
              // Skip near-duplicates or negative gaps
              if (gapHours <= 0.25 || gapHours < 0) continue;
              
              const requiredGap = curr.requiredGap || 4;
              if (gapHours < requiredGap - 0.17) {
                agentDiscrepancies.push({
                  careWorkerName: curr.careWorkerInitials || 'Unknown',
                  date: curr.date,
                  timeSlot: curr.timeSlot,
                  medication: medication,
                  medicationId: medId || undefined,
                  issue: `Time gap violation: Only ${gapHours.toFixed(1)} hours between doses (required: ${requiredGap}h). Previous: ${prev.extractedTime}, Current: ${curr.extractedTime}.`,
                  severity: "high",
                  actions: { performanceNote: true, meeting: "in_person", referToManager: true }
                });
              }
            }
          });

          // Cross-day gap check: compare last entry of day vs first entry of next day.
          const medDayMap = new Map<string, Map<number, any[]>>();
          medDateEntriesForGap.forEach((dayEntries, key) => {
            const [medKey] = key.split("|");
            const byDate = medDayMap.get(medKey) || new Map<number, any[]>();
            for (const entry of dayEntries) {
              const idx = Number(entry.dateIndex);
              if (!Number.isFinite(idx) || idx < 0) continue;
              const list = byDate.get(idx) || [];
              list.push(entry);
              byDate.set(idx, list);
            }
            if (byDate.size > 0) medDayMap.set(medKey, byDate);
          });

          medDayMap.forEach((byDate, medKey) => {
            const dateIndices = Array.from(byDate.keys()).sort((a, b) => a - b);
            for (let i = 0; i < dateIndices.length - 1; i++) {
              const currIdx = dateIndices[i];
              const nextIdx = dateIndices[i + 1];
              if (nextIdx !== currIdx + 1) continue;
              const currEntries = (byDate.get(currIdx) || []).sort((a: any, b: any) => (a.extractedMinutes || 0) - (b.extractedMinutes || 0));
              const nextEntries = (byDate.get(nextIdx) || []).sort((a: any, b: any) => (a.extractedMinutes || 0) - (b.extractedMinutes || 0));
              if (currEntries.length === 0 || nextEntries.length === 0) continue;
              const prev = currEntries[currEntries.length - 1];
              const curr = nextEntries[0];
              const gapHours = ((curr.extractedMinutes || 0) + 24 * 60 - (prev.extractedMinutes || 0)) / 60;
              if (gapHours <= 0.25 || gapHours < 0) continue;
              const requiredGap = curr.requiredGap || 4;
              if (gapHours < requiredGap - 0.17) {
                const medId = medKey.startsWith("id:") ? Number(medKey.slice(3)) || 0 : 0;
                const medication =
                  medId > 0
                    ? agentMedicationNameById.get(medId) || prev?.medication || ''
                    : medKey.startsWith("name:")
                      ? medKey.slice(5)
                      : prev?.medication || '';
                agentDiscrepancies.push({
                  careWorkerName: curr.careWorkerInitials || 'Unknown',
                  date: curr.date,
                  timeSlot: curr.timeSlot,
                  medication: medication,
                  medicationId: medId || undefined,
                  issue: `Time gap violation: Only ${gapHours.toFixed(1)} hours between doses (required: ${requiredGap}h). Previous: ${prev.extractedTime} (prior day), Current: ${curr.extractedTime}.`,
                  severity: "high",
                  actions: { performanceNote: true, meeting: "in_person", referToManager: true }
                });
              }
            }
          });

          // =====================================================================
          // SCHEDULED DAY CHECKS (instruction-driven)
          // =====================================================================
          const dayIndexByKey = new Map<string, number>();
          const dateLabelByKey = new Map<string, string>();
          const dayTokenMap: Record<string, number> = {
            sun: 0,
            sunday: 0,
            mon: 1,
            monday: 1,
            tue: 2,
            tues: 2,
            tuesday: 2,
            wed: 3,
            weds: 3,
            wednesday: 3,
            thu: 4,
            thur: 4,
            thurs: 4,
            thursday: 4,
            fri: 5,
            friday: 5,
            sat: 6,
            saturday: 6,
          };

          const extractDayIndexFromLabel = (label: string): number | null => {
            const match = String(label || "").match(/\b(Sun|Mon|Tue|Tues|Wed|Weds|Thu|Thur|Thurs|Fri|Sat)\b/i);
            if (!match) return null;
            const key = match[1].toLowerCase();
            return dayTokenMap[key] ?? null;
          };

          const extractScheduledDays = (text: string): Set<number> | null => {
            const lower = String(text || "").toLowerCase();
            if (!lower.trim()) return null;
            if (/(\bevery\s*day\b|\bdaily\b|\beach\s*day\b)/i.test(lower)) return null;

            const days = new Set<number>();
            if (/\bweekdays?\b/i.test(lower)) {
              [1, 2, 3, 4, 5].forEach((d) => days.add(d));
            }
            if (/\bweekends?\b/i.test(lower)) {
              [0, 6].forEach((d) => days.add(d));
            }

            const rangeMatch = lower.match(/\b(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)\b\s*(?:-|to)\s*\b(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)\b/i);
            if (rangeMatch) {
              const start = dayTokenMap[rangeMatch[1]];
              const end = dayTokenMap[rangeMatch[2]];
              if (typeof start === "number" && typeof end === "number") {
                let current = start;
                while (true) {
                  days.add(current);
                  if (current === end) break;
                  current = (current + 1) % 7;
                }
              }
            }

            const dayMatches = lower.match(/\b(mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/gi) || [];
            for (const token of dayMatches) {
              const idx = dayTokenMap[token.toLowerCase()];
              if (typeof idx === "number") days.add(idx);
            }

            if (days.size === 0) return null;
            if (days.size >= 7) return null;
            return days;
          };

          agentDates.forEach((dateLabel: string) => {
            const key = normalizeDateKey(dateLabel);
            const dayIndex = extractDayIndexFromLabel(dateLabel);
            if (key && typeof dayIndex === "number") {
              dayIndexByKey.set(key, dayIndex);
              dateLabelByKey.set(key, dateLabel);
            }
          });

          const entriesByMedDate = new Map<string, any[]>();
          agentEntries.forEach((entry: any) => {
            const medId = Number(entry.medicationId) || 0;
            const medKey = medId > 0 ? `id:${medId}` : `name:${entry.medication || ""}`;
            const dateKey = normalizeDateKey(entry.date || "");
            if (!dateKey) return;
            const key = `${medKey}|${dateKey}`;
            const list = entriesByMedDate.get(key) || [];
            list.push(entry);
            entriesByMedDate.set(key, list);
          });

          agentMedications.forEach((med: any) => {
            if (med?.isPRN) return;
            const medId = Number(med.medicationId) || 0;
            const medKey = medId > 0 ? `id:${medId}` : `name:${med.name || ""}`;
            const scheduleDays = extractScheduledDays(`${med?.name || ""} ${med?.instructions || ""}`);
            if (!scheduleDays || scheduleDays.size === 0) return;

            dayIndexByKey.forEach((dayIndex, dateKey) => {
              const entryKey = `${medKey}|${dateKey}`;
              const entries = entriesByMedDate.get(entryKey) || [];
              const hasAnyEntry = entries.length > 0;
              const dateLabel = dateLabelByKey.get(dateKey) || dateKey;

              if (scheduleDays.has(dayIndex) && !hasAnyEntry) {
                agentDiscrepancies.push({
                  careWorkerName: "N.N.",
                  date: dateLabel,
                  timeSlot: "",
                  medication: med.name || "",
                  medicationId: medId || undefined,
                  issue: "Scheduled-day record missing based on medication instructions",
                  severity: "medium",
                  actions: { performanceNote: true, meeting: "phone", referToManager: false },
                });
              }

              if (!scheduleDays.has(dayIndex) && hasAnyEntry) {
                const entry = entries[0];
                agentDiscrepancies.push({
                  careWorkerName: entry?.careWorkerInitials || "N.N.",
                  date: entry?.date || dateLabel,
                  timeSlot: entry?.timeSlot || "",
                  medication: med.name || "",
                  medicationId: medId || undefined,
                  issue: "Medication recorded on a non-scheduled day based on instructions",
                  severity: "medium",
                  actions: { performanceNote: true, meeting: "phone", referToManager: false },
                });
              }
            });
          });
          
          // =====================================================================
          // MU FREQUENCY WARNING
          // =====================================================================
          const muCounts = new Map<string, { count: number; medication: string; medicationId?: number }>();
          agentEntries.forEach((entry: any) => {
            if ((entry.code || '').toUpperCase() === 'MU') {
              const medId = Number(entry.medicationId) || 0;
              const key = medId > 0 ? `id:${medId}` : `name:${entry.medication || ""}`;
              const existing = muCounts.get(key) || {
                count: 0,
                medication: medId > 0 ? agentMedicationNameById.get(medId) || entry.medication || "" : entry.medication || "",
                medicationId: medId || undefined,
              };
              existing.count += 1;
              muCounts.set(key, existing);
            }
          });
          
          muCounts.forEach(({ count, medication, medicationId }) => {
            if (count >= 3) {
              agentWarnings.push({
                type: "medication_unavailable_pattern",
                severity: "medium",
                medication,
                medicationId,
                description: `Medication Unavailable (MU) recorded ${count} times`,
                recommendedAction: "Check if medication has been discontinued or stock issues"
              });
            }
          });

          const nonAdminTrendCounts = { R: 0, SA: 0, F: 0, NH: 0, MU: 0 };
          agentEntries.forEach((entry: any) => {
            const code = normalizeAgentCode(entry.code || "");
            if (code === "R" || code === "PRN-R") nonAdminTrendCounts.R += 1;
            else if (code === "SA") nonAdminTrendCounts.SA += 1;
            else if (code === "F") nonAdminTrendCounts.F += 1;
            else if (code === "NH") nonAdminTrendCounts.NH += 1;
            else if (code === "MU") nonAdminTrendCounts.MU += 1;
          });
          const NON_ADMIN_TREND_THRESHOLD = 3;
          Object.entries(nonAdminTrendCounts).forEach(([code, count]) => {
            if (count >= NON_ADMIN_TREND_THRESHOLD) {
              const labels: Record<string, string> = {
                R: "Refused",
                SA: "Self-administered",
                F: "Family-administered",
                NH: "Not home",
                MU: "Medication unavailable",
              };
              agentWarnings.push({
                type: "non_administration_trend",
                severity: "medium",
                medication: "Multiple medications",
                description: `${labels[code] || code} (${code}) recorded ${count} times in this audit period`,
                recommendedAction: "Review if there is an emerging trend in non-administration and document follow-up actions",
              });
            }
          });
          
          // =====================================================================
          // GROUP REFUSALS BY CARE WORKER + MEDICATION
          // =====================================================================
          const groupRefusals = (refusals: any[]) => {
            const groups = new Map<string, any>();
            refusals.forEach((d: any) => {
              const key = `${d.careWorkerName}|${d.medicationId || d.medication}`;
              if (!groups.has(key)) {
                groups.set(key, {
                  careWorkerName: d.careWorkerName,
                  medication: d.medication,
                  medicationId: d.medicationId || undefined,
                  code: d.code || '',
                  dates: [],
                  count: 0
                });
              }
              const group = groups.get(key)!;
              group.dates.push({ date: d.date, timeSlot: d.timeSlot, code: d.code || '' });
              group.count++;
            });
            return Array.from(groups.values()).sort((a, b) => b.count - a.count);
          };
          
          const groupedMainRefusals = groupRefusals(mainRefusalDiscrepancies);
          const groupedPrnRefusals = groupRefusals(prnRefusalDiscrepancies);
          const groupedRefusals = [...groupedMainRefusals, ...groupedPrnRefusals];
          
          // Separate refusals from other discrepancies
          const otherDiscrepancies = agentDiscrepancies.filter(d => 
            !d.issue.includes('refused')
          );
          
          // Prioritize discrepancies
          const prioritizedDiscrepancies = otherDiscrepancies.sort((a, b) => {
            const getPriority = (issue: string) => {
              if (issue.includes('Time gap')) return 1;
              if (issue.includes('Missed')) return 2;
              return 3;
            };
            return getPriority(a.issue) - getPriority(b.issue);
          });
          
          // =====================================================================
          // BUILD AGENT RESULT
          // =====================================================================
          sendProgress(90, "Building analysis result...", "agent_building_result");
          
          // Calculate code counts
          const agentCodeCounts = { AD: 0, AS: 0, P: 0, R: 0 };
          const agentPrnCodeCounts = { PRN: 0, F: 0, MU: 0, NH: 0, R: 0 };
          
          agentEntries.forEach((entry: any) => {
            const code = (entry.code || '').toUpperCase();
            const medId = Number(entry.medicationId) || 0;
            const isPRN = (medId > 0 && agentPrnMedIds.has(medId)) || agentPrnMeds.has(entry.medication);
            
            if (isPRN) {
              if (code === 'PRN' || code === 'PRN-AD' || code === 'PRN-AS') agentPrnCodeCounts.PRN++;
              else if (code === 'F') agentPrnCodeCounts.F++;
              else if (code === 'MU') agentPrnCodeCounts.MU++;
              else if (code === 'NH') agentPrnCodeCounts.NH++;
              else if (code === 'R' || code === 'PRN-R') agentPrnCodeCounts.R++;
            } else {
              if (code === 'AD') agentCodeCounts.AD++;
              else if (code === 'AS') agentCodeCounts.AS++;
              else if (code === 'P') agentCodeCounts.P++;
              else if (code === 'R') agentCodeCounts.R++;
            }
          });

          // Code mixing check (non-PRN meds only)
          const agentUsedLevelCodes: string[] = [];
          if (agentCodeCounts.AD > 0) agentUsedLevelCodes.push("AD");
          if (agentCodeCounts.AS > 0) agentUsedLevelCodes.push("AS");
          if (agentCodeCounts.P > 0) agentUsedLevelCodes.push("P");
          const agentCodeConflictDetected = agentUsedLevelCodes.length > 1;
          let agentCodeConflictDetails: string | null = null;
          if (agentCodeConflictDetected) {
            agentCodeConflictDetails = `Mixed codes on regular medications: ${agentUsedLevelCodes.join(", ")}. AD=${agentCodeCounts.AD}, AS=${agentCodeCounts.AS}, P=${agentCodeCounts.P}`;
            agentWarnings.push({
              type: "code_conflict",
              severity: "high",
              medication: "Regular medications (non-PRN)",
              description: agentCodeConflictDetails + ". Service user should have ONE medication level.",
              recommendedAction: "Review medication level with pharmacy and update EMAR system"
            });
          }
          
          // Determine service user type based on code distribution
          const totalAdminCodes = agentCodeCounts.AD + agentCodeCounts.AS + agentCodeCounts.P;
          let agentServiceUserType: "administer" | "assist" | "prompt" = "prompt";
          if (totalAdminCodes > 0) {
            const adRatio = agentCodeCounts.AD / totalAdminCodes;
            const asRatio = agentCodeCounts.AS / totalAdminCodes;
            if (adRatio > 0.6) agentServiceUserType = "administer";
            else if (asRatio > 0.4) agentServiceUserType = "assist";
          }
          
          // Extract office-closed entries (codes without initials, manually closed by office staff)
          const officeClosedEntries = agentEntries.filter((e: any) => e.isOfficeClosed).map((e: any) => ({
            medication: e.medication,
            medicationId: Number(e.medicationId) || undefined,
            date: e.date,
            timeSlot: e.timeSlot,
            code: e.code,
            closedByStaff: e.closedByStaff || 'Office Staff',
            closedTime: e.closedTime || ''
          }));
          console.log(`Agent: Found ${officeClosedEntries.length} office-closed entries`);

          // Extract ALL entries with support level codes (AS/AD/P) for frontend recalculation
          const supportLevelCodes = ['AS', 'AD', 'P'];
          const supportCodeEntries = agentEntries
            .filter((e: any) => e.code && supportLevelCodes.includes(String(e.code).toUpperCase()))
            .map((e: any) => ({
              careWorkerName: e.careWorkerInitials || 'Unknown',
              medication: e.medication,
              medicationId: Number(e.medicationId) || undefined,
              date: e.date,
              timeSlot: e.timeSlot,
              code: String(e.code || '').toUpperCase()
            }));
          console.log(`Agent: Found ${supportCodeEntries.length} entries with support level codes (AS/AD/P)`);

          const agentCareWorkerInferenceIndex = buildCareWorkerInferenceIndex(
            agentEntries,
            (entry: any) => entry.careWorkerInitials || entry.careWorker || ""
          );
          const agentAllCareWorkersRaw = collectAllCareWorkers(
            agentEntries,
            (entry: any) => entry.careWorkerInitials || entry.careWorker || ""
          );
          
          const agentAnalysisResult = {
            serviceUserName: agentExtractedData.serviceUserInitials || 'N.N.',
            serviceUserInitials: agentExtractedData.serviceUserInitials || 'N.N.',
            serviceUserType: agentServiceUserType,
            allergies: agentExtractedData.allergies || 'NKDA',
            medicationLevelEvidence: `Code counts (regular): AD=${agentCodeCounts.AD}, AS=${agentCodeCounts.AS}, P=${agentCodeCounts.P}. PRN: PRN=${agentPrnCodeCounts.PRN}, F=${agentPrnCodeCounts.F}, MU=${agentPrnCodeCounts.MU}, NH=${agentPrnCodeCounts.NH}, R=${agentPrnCodeCounts.R}. Service level: ${agentServiceUserType.toUpperCase()}.`,
            codeConflictDetected: agentCodeConflictDetected,
            codeConflictDetails: agentCodeConflictDetails,
            auditPeriodStart: agentDates[0] || '',
            auditPeriodEnd: agentDates[agentDates.length - 1] || '',
            warnings: agentWarnings,
            drugInteractions: agentExtractedData.drugInteractions,
            hasDiscrepancies: agentDiscrepancies.length > 0,
            discrepancies: prioritizedDiscrepancies,
            groupedRefusals: groupedRefusals,
            groupedMainRefusals: groupedMainRefusals,
            groupedPrnRefusals: groupedPrnRefusals,
            totalRefusalCount: mainRefusalDiscrepancies.length + prnRefusalDiscrepancies.length,
            totalMainRefusalCount: mainRefusalDiscrepancies.length,
            totalPrnRefusalCount: prnRefusalDiscrepancies.length,
            totalOtherDiscrepancyCount: otherDiscrepancies.length,
            userVerificationItems: agentVerificationItems,
            prnMedications: {
              hasPRN: agentPrnMeds.size > 0,
              medications: agentMedications.filter((m: any) => m.isPRN).map((m: any) => ({
                name: m.name,
                protocol: 'PRN protocol should be in place'
              }))
            },
            officeClosedEntries: officeClosedEntries,
            supportCodeEntries: supportCodeEntries,
            allCareWorkers: agentAllCareWorkersRaw,
            totalEntriesProcessed: agentEntries.length,
            totalMedications: agentMedications.length,
            datesAudited: agentDates,
            timeSlotsFound: agentTimeSlots,
            extractionMethod: 'emar-agent',
            validationPasses: 3,
            validationStatus: agentExtractedData.consensusStatus === 'verified' ? 'completed' : 'partial',
            validationEvidence: {},
            initialDiscrepancyCount: agentDiscrepancies.length,
            themesAndTrends: `Agent processed ${agentEntries.length} entries across ${agentMedications.length} medications for ${agentDates.length} days. Consensus: ${agentExtractedData.consensusStatus}. Found ${agentDiscrepancies.length} discrepancies.`,
            gapsInKnowledge: agentDiscrepancies.length > 0
              ? 'Training needed on: ' + Array.from(new Set(agentDiscrepancies.map((d: any) => {
                  if (d.issue.includes('refused')) return 'documenting refusal reasons';
                  if (d.issue.includes('Time gap')) return 'medication timing requirements';
                  return 'documentation';
                }))).join(', ')
              : 'No significant gaps identified.',
            unknownCareWorkerInitials: [],
            expectedEntriesCount: agentMedications.length * agentDates.length * agentTimeSlots.length,
            actualEntriesCount: agentEntries.length,
            expectedEntryCount: 0,
            countAgreement: true,
            countValidation: {
              medicationCountConsensus: true,
              agreedMedicationCount: agentMedications.length,
              extractedMedicationCount: agentMedications.length,
              agreedCount: agentEntries.length,
              extractedCount: agentEntries.length,
              match: true,
              perMedicationExpectedCounts: {},
              perMedicationActualCounts: {}
            },
            extractionConsensus: {
              status: agentExtractedData.consensusStatus,
              pass1Count: agentEntries.length,
              pass2Count: agentEntries.length,
              pass3Count: agentEntries.length,
              matchingPasses: [1, 2, 3],
              fallbackPassUsed: null,
              escalationReason: null,
              description: agentExtractedData.consensusStatus === 'verified'
                ? 'Agent extraction verified with consensus'
                : 'Agent extraction completed (no full consensus)'
            }
          };

          const agentScrubbedResult = {
            ...agentAnalysisResult,
            serviceUserName: normalizeInitials(agentAnalysisResult.serviceUserInitials || agentAnalysisResult.serviceUserName),
            serviceUserInitials: normalizeInitials(agentAnalysisResult.serviceUserInitials || agentAnalysisResult.serviceUserName),
          };
          const agentRawResult =
            allowSensitiveView && serviceUserFullName
              ? {
                  ...agentAnalysisResult,
                  serviceUserName: serviceUserFullName,
                  serviceUserInitials: agentScrubbedResult.serviceUserInitials,
                  scrubbedResult: agentScrubbedResult,
                }
              : null;
          
          console.log('Agent: Analysis complete -', {
            entries: agentEntries.length,
            discrepancies: agentDiscrepancies.length,
            refusals: mainRefusalDiscrepancies.length + prnRefusalDiscrepancies.length,
            drugInteractions: agentExtractedData.drugInteractions.length
          });
          
          // ========================================================================
          // RESOLVE CARE WORKER NAMES BASED ON PRIVACY SETTINGS (AGENT PATH)
          // - If allowSensitiveView=true (admin): show full names from database
          // - Otherwise: show only initials
          // - "N.N." only when no initials at all (call documentation not completed)
          // ========================================================================
          const resolveNamesInArray = async (items: any[]): Promise<any[]> => {
            if (!items || items.length === 0) return items;
            return await Promise.all(
              items.map(async (item) => {
                if (item.careWorkerName) {
                  item.careWorkerName = await resolveCareWorkerName(item.careWorkerName, allowSensitiveView);
                }
                return item;
              })
            );
          };

          // Resolve names in all arrays
          agentAnalysisResult.discrepancies = applyCareWorkerInference(agentAnalysisResult.discrepancies, agentCareWorkerInferenceIndex);
          agentAnalysisResult.userVerificationItems = applyCareWorkerInference(agentAnalysisResult.userVerificationItems, agentCareWorkerInferenceIndex);
          agentAnalysisResult.groupedRefusals = applyCareWorkerInference(agentAnalysisResult.groupedRefusals, agentCareWorkerInferenceIndex);
          agentAnalysisResult.groupedMainRefusals = applyCareWorkerInference(agentAnalysisResult.groupedMainRefusals, agentCareWorkerInferenceIndex);
          agentAnalysisResult.groupedPrnRefusals = applyCareWorkerInference(agentAnalysisResult.groupedPrnRefusals, agentCareWorkerInferenceIndex);
          agentAnalysisResult.supportCodeEntries = applyCareWorkerInference(agentAnalysisResult.supportCodeEntries, agentCareWorkerInferenceIndex);

          agentAnalysisResult.discrepancies = await resolveNamesInArray(agentAnalysisResult.discrepancies);
          agentAnalysisResult.userVerificationItems = await resolveNamesInArray(agentAnalysisResult.userVerificationItems);
          agentAnalysisResult.groupedRefusals = await resolveNamesInArray(agentAnalysisResult.groupedRefusals);
          agentAnalysisResult.groupedMainRefusals = await resolveNamesInArray(agentAnalysisResult.groupedMainRefusals);
          agentAnalysisResult.groupedPrnRefusals = await resolveNamesInArray(agentAnalysisResult.groupedPrnRefusals);
          agentAnalysisResult.officeClosedEntries = await resolveNamesInArray(agentAnalysisResult.officeClosedEntries);
          agentAnalysisResult.supportCodeEntries = await resolveNamesInArray(agentAnalysisResult.supportCodeEntries);
          agentAnalysisResult.allCareWorkers = await resolveCareWorkerList(agentAnalysisResult.allCareWorkers || [], allowSensitiveView);
          
          // Send final result
          sendProgress(100, 'Analysis complete!', 'complete');
          // Restore PII tokens in the result before sending to client
          const restoredAgentResult = emarPIIVault.restore(agentRawResult || agentScrubbedResult);
          emarPIIVault.logAudit('RESTORE', '/api/ai/analyze-emar', aiUserContext.userId, aiUserContext.username);
          sendEvent('result', restoredAgentResult);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          emarPIIVault.clear();
          return res.end();
          
        } catch (agentError: any) {
          console.error("EMAR Agent failed, falling back to standard extraction:", agentError.message);
          sendEvent('warning', {
            message: "Agent extraction failed, using standard method...",
            kind: "agent_fallback",
            userFacing: false,
          });
          agentExtractionSucceeded = false;
        }
      }
      
      // STANDARD EXTRACTION (when agent is disabled or fails)
      if (!agentExtractionSucceeded) {
      let extractionMethod = "vision-api";
      let gridOverrideUsed = false;
      let gridPrimaryEnabled = false;
      let gridNonBlankCount = 0;
      let gridPrnKeys = new Set<string>();
      const gridPrnStats = new Map<string, { prnCount: number; nonBlankCount: number }>();
      const gridPrnStatsByMedId = new Map<number, { prnCount: number; nonBlankCount: number }>();
      // STEP 2: Two-phase AI extraction to handle large grids
      // Phase 1: Extract metadata only (medications, dates, timeSlots) from document text
      
      // Build table structure context for AI
      const tableStructureContext = tableStructure.hasTable 
        ? `\nDOCUMENT LAYOUT ANALYSIS:
This document appears to be a ${tableStructure.tableType.toUpperCase()} format EMAR.
- Table detected: YES
- Layout type: ${tableStructure.tableType === 'grid' ? 'Grid with dates as columns and medications as rows' : 'List format with entries on separate lines'}
- ${tableStructure.detectedDatesOnSameLine} dates detected on header line (indicates column structure)
- Time slots found: ${tableStructure.detectedTimeSlots.join(', ')}
- Estimated medication rows: ${tableStructure.rowCount}

Use this layout information to correctly parse the grid structure.
`
        : '';

      const buildMetadataFromGrid = (grid: ParsedEMAR) => {
        const meds = (grid.medications || [])
          .map((med) => {
            const name = typeof med?.name === "string" ? med.name.trim() : "";
            if (!name) return null;
            const inferredGeneric = inferGenericNameFromMedicationLabel(name);
            const scheduledSlots = Array.isArray(med?.timeSlots) && med.timeSlots.length > 0
              ? med.timeSlots
              : Array.isArray(grid.timeSlots) ? grid.timeSlots : [];
            return {
              name,
              gridMedicationId: typeof (med as any)?.row === "number" ? (med as any).row + 1 : undefined,
              genericName: inferredGeneric,
              isPRN: false,
              instructions: typeof med?.instructions === "string" ? med.instructions : "",
              requiredGapHours: 4,
              scheduledTimeSlots: scheduledSlots,
              timeSlots: scheduledSlots
            };
          })
          .filter(Boolean) as any[];

        return {
          serviceUserInitials: normalizeInitials(grid.serviceUserName || ""),
          allergies: grid.allergies || "No known allergies",
          medications: meds,
          dates: Array.isArray(grid.dates) ? grid.dates : [],
          timeSlots: Array.isArray(grid.timeSlots) ? grid.timeSlots : []
        };
      };

      const gridNonBlankCountEarly = gridBaseline?.cells?.reduce((count, cell) => {
        const code = String(cell.code || "").trim();
        if (code && code !== "BLANK" && code !== "N/A") return count + 1;
        const content = String(cell.content || "");
        if (/\b(AD|AS|P|R|MU|NH|SA|F|FA|PRN|MISSED)\b/i.test(content)) return count + 1;
        if (cell.time && cell.time.trim()) return count + 1;
        if (cell.careWorker && cell.careWorker.trim()) return count + 1;
        return count;
      }, 0) || 0;

      const gridMetadataCandidate = gridBaseline ? buildMetadataFromGrid(gridBaseline) : null;
      const gridMedicationNames = gridMetadataCandidate?.medications || [];
      const lowQualityGridMedCount = gridMedicationNames.filter((med) => {
        const name = typeof med?.name === "string" ? med.name.trim() : "";
        if (!name) return true;
        const tokens: string[] = name.split(/\s+/).filter(Boolean);
        if (!tokens.some((token) => /[a-zA-Z]/.test(token))) return true;
        return tokens.length <= 2 && /^(?:\d|\d+\w+)\b/.test(name);
      }).length;
      const gridMedicationQualityRatio =
        gridMedicationNames.length > 0 ? lowQualityGridMedCount / gridMedicationNames.length : 1;

      const gridLooksStrong = Boolean(
        gridMetadataCandidate &&
          gridMetadataCandidate.medications.length >= 2 &&
          gridMetadataCandidate.dates.length >= 1 &&
          gridMetadataCandidate.timeSlots.length >= 1 &&
          gridNonBlankCountEarly > 0 &&
          gridMedicationQualityRatio < 0.4
      );
      let metadataFromGrid = false;
      let metadata = {
        serviceUserInitials: "",
        allergies: "",
        medications: [] as any[],
        dates: [] as string[],
        timeSlots: [] as string[]
      };
      let drugInteractions: DrugInteraction[] = [];
      
      const metadataPrompt = `You are an EMAR (Electronic Medication Administration Record) data extractor analyzing EMAR document text.
This tool works with ANY EMAR system from ANY provider (e.g., CMM, CarePlanner, MedPass, PCS, etc.).
    ${tableStructureContext}${correctionsContext}
Analyze the document text and extract ONLY the metadata (do NOT extract individual administration entries yet).

Return a JSON object with this EXACT structure:
{
  "serviceUserInitials": "F.O.",
  "allergies": "No known allergies",
  "medications": [
    {
      "name": "Paracetamol 500mg Tablets",
      "genericName": "paracetamol",
      "isPRN": true,
      "instructions": "Take 1-2 tablets every 4-6 hours as needed",
      "requiredGapHours": 4,
      "scheduledTimeSlots": ["08:00-09:00", "20:30-21:00"]
    }
  ],
  "dates": ["Sun, 30 Nov", "Mon, 01 Dec", "Tue, 02 Dec"],
  "timeSlots": ["08:00-09:00", "12:00-12:30", "16:00-16:30", "20:30-21:00"]
}

EXTRACTION RULES:
1. serviceUserInitials: Look for the service user/patient name. Convert to initials with dots (e.g., "Freda O'Neill" -> "F.O.")
2. allergies: Look for allergy information. If none visible, use "No known allergies"
3. medications: Each medication should include:
   - name: The full medication name including strength/form exactly as shown
   - genericName: The active ingredient (e.g., paracetamol, ibuprofen, omeprazole)
   - isPRN: true ONLY if the prescription/instructions text contains: "PRN", "as required", "as needed", "when required", "up to X times/tablets/daily", "if needed". Do NOT set isPRN based on document sections - only the prescription text itself.
   - instructions: The dosage/administration instructions (CRITICAL: Extract exactly as written - this determines PRN status)
   - requiredGapHours: Minimum hours between doses (default 4 for most meds, 6-8 for controlled drugs)
   - scheduledTimeSlots: The time slots that apply to this medication
4. dates: Extract ALL dates visible in the EXACT format shown
5. timeSlots: Look for time windows in the document
6. medications: Include EVERY medication row you can see, even if no strength/unit is shown or it appears only once across pages.

IMPORTANT: Extract exactly what you see in the text - don't guess or make assumptions.`;

      const DETERMINISTIC_SEED = 42;

      const mergeMetadata = (base: any, incoming: any) => {
        const merged = {
          serviceUserInitials: base.serviceUserInitials || incoming.serviceUserInitials || "",
          allergies: base.allergies || incoming.allergies || "",
          medications: [] as any[],
          dates: [] as string[],
          timeSlots: [] as string[]
        };

        const normalizeKey = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
        const medByKey = new Map<string, any>();
        for (const m of [...(base.medications || []), ...(incoming.medications || [])]) {
          const name = typeof m?.name === "string" ? m.name : "";
          if (!name.trim()) continue;
          const key = normalizeKey(name);
          if (!medByKey.has(key)) {
            medByKey.set(key, m);
            continue;
          }
          const existing = medByKey.get(key);
          // Prefer richer instruction text when merging
          const existingInstr = typeof existing?.instructions === "string" ? existing.instructions : "";
          const nextInstr = typeof m?.instructions === "string" ? m.instructions : "";
          medByKey.set(key, nextInstr.length > existingInstr.length ? { ...existing, ...m } : { ...m, ...existing });
        }

        merged.medications = Array.from(medByKey.values());

        const uniq = (arr: any[]) => Array.from(new Set(arr.filter(Boolean).map((x) => String(x).trim()).filter(Boolean)));
        merged.dates = uniq([...(base.dates || []), ...(incoming.dates || [])]);
        merged.timeSlots = uniq([...(base.timeSlots || []), ...(incoming.timeSlots || [])]);
        return merged;
      };

      const refineMedicationNamesWithAI = async (meds: any[]) => {
        if (!Array.isArray(meds) || meds.length === 0) return meds;
        const cleaned: any[] = [];
        const batchSize = 8;

        for (let i = 0; i < meds.length; i += batchSize) {
          const batch = meds.slice(i, i + batchSize).map((med, idx) => ({
            index: i + idx,
            name: typeof med?.name === "string" ? med.name : "",
            instructions: typeof med?.instructions === "string" ? med.instructions : "",
            scheduledTimeSlots: Array.isArray(med?.scheduledTimeSlots) ? med.scheduledTimeSlots : [],
          }));

          const prompt = `You are a pharmacy data normalizer. For each item, separate the MEDICATION NAME from the ADMINISTRATION INSTRUCTIONS.

Rules:
- name: medication name + strength/form if shown (e.g., "Paracetamol 500mg tablets"). Do NOT include instructions like "take", "apply", "10ml", "twice daily".
- instructions: dosage + frequency + route + PRN rules. Keep as close to source as possible.
- If the name field looks like only a dose/instruction, move it into instructions and keep name minimal if possible. If you cannot infer a name, return the original name unchanged.
- isPRN: true only if instructions explicitly indicate PRN / as needed.
- requiredGapHours: extract from instructions if stated; otherwise use 4.

Return JSON with EXACT shape:
{
  "medications": [
    { "index": 0, "name": "...", "instructions": "...", "isPRN": true/false, "requiredGapHours": 4 }
  ]
}`;

          try {
            const response = await executeSecureTextCompletion({
              endpoint: "/api/ai/analyze-emar",
              feature: "emar_medication_normalize",
              model: emarMetadataModel,
              userContext: aiUserContext,
              inputText: JSON.stringify({ medications: batch }),
              systemPrompt: prompt,
              maxCompletionTokens: 1200,
              temperature: 0,
              seed: DETERMINISTIC_SEED,
              responseFormat: { type: "json_object" },
              useCache: false,
            });

            const content = response.restoredText || "{}";
            const parsed = parseJsonFromContent(content);
            const entries = Array.isArray(parsed?.medications) ? parsed.medications : [];
            for (const entry of entries) {
              if (typeof entry?.index !== "number") continue;
              cleaned.push(entry);
            }
          } catch (error) {
            console.error("Medication normalization error:", error);
          }
        }

        if (cleaned.length === 0) return meds;
        const byIndex = new Map<number, any>();
        cleaned.forEach((entry) => {
          byIndex.set(entry.index, entry);
        });

        return meds.map((med, idx) => {
          const updated = byIndex.get(idx);
          if (!updated) return med;
          const nextName = typeof updated.name === "string" && updated.name.trim() ? updated.name.trim() : med.name;
          const nextInstructions =
            typeof updated.instructions === "string" && updated.instructions.trim()
              ? updated.instructions.trim()
              : med.instructions;
          return {
            ...med,
            name: nextName,
            instructions: nextInstructions,
            isPRN: typeof updated.isPRN === "boolean" ? updated.isPRN : med.isPRN,
            requiredGapHours: typeof updated.requiredGapHours === "number" ? updated.requiredGapHours : med.requiredGapHours,
          };
        });
      };

      const extractMetadataForText = async (text: string) => {
        const metadataResponse = await executeSecureTextCompletion({
          endpoint: "/api/ai/analyze-emar",
          feature: "emar_metadata",
          model: emarMetadataModel,
          userContext: aiUserContext,
          inputText: `Analyze this EMAR document and extract the metadata:\n\n${text}`,
          systemPrompt: metadataPrompt,
          maxCompletionTokens: 4000,
          temperature: 0,
          seed: DETERMINISTIC_SEED,
          responseFormat: { type: "json_object" },
          useCache: false,
        });
        return metadataResponse.restoredText || "{}";
      };

      if (gridLooksStrong && gridMetadataCandidate) {
        metadata = gridMetadataCandidate;
        metadataFromGrid = true;
        console.log(
          "DEBUG: Using grid metadata -",
          metadata.medications?.length,
          "medications,",
          metadata.dates?.length,
          "dates,",
          metadata.timeSlots?.length,
          "timeSlots"
        );
        sendProgress(15, `Found ${metadata.medications?.length || 0} medications (grid)...`, "metadata_complete");
      } else {
        // Legacy: if chunked, extract metadata across ALL chunks and merge.
        const metadataContents: string[] = [];
        if (emarMode === "legacy" && Array.isArray(legacyTextChunks) && legacyTextChunks.length > 1) {
          for (let i = 0; i < legacyTextChunks.length; i++) {
            sendProgress(10, `Extracting metadata (chunk ${i + 1}/${legacyTextChunks.length})...`, "metadata_running");
            metadataContents.push(await extractMetadataForText(legacyTextChunks[i]));
          }
        } else {
          metadataContents.push(await extractMetadataForText(analysisText));
        }
        
        try {
          for (const content of metadataContents) {
            const parsed = parseJsonFromContent(content);
            if (!parsed) {
              throw new Error("Unable to parse metadata JSON");
            }
            metadata = mergeMetadata(metadata, parsed);
          }
          console.log("DEBUG: Metadata extracted -", metadata.medications?.length, "medications,", metadata.dates?.length, "dates,", metadata.timeSlots?.length, "timeSlots");
          sendProgress(15, `Found ${metadata.medications?.length || 0} medications...`, "metadata_complete");
        } catch (e) {
          console.error("Failed to parse metadata JSON:", e);
          console.error("Raw metadata content:", metadataContents[0]);
          sendEvent('error', { message: "Failed to parse medication data from document" });
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          return res.end();
        }
      }
      
      if (metadata.medications && metadata.medications.length > 0) {
        sendProgress(18, "Normalizing medication names...", "medication_normalization");
        metadata.medications = await refineMedicationNamesWithAI(metadata.medications);
      }

      // Validate that we actually found medications
      if (!metadata.medications || metadata.medications.length === 0) {
        console.error("No medications found in metadata");
        sendEvent('error', { message: "No medications found in the document. Please check the PDF contains medication records." });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      if (Array.isArray(metadata.medications)) {
        metadata.medications = metadata.medications.map((med: any) => {
          const name = typeof med?.name === "string" ? med.name : "";
          const genericName = typeof med?.genericName === "string" ? med.genericName : "";
          return {
            ...med,
            genericName: genericName || inferGenericNameFromMedicationLabel(name)
          };
        });
      }
      
      // =====================================================================
      // DATE COUNT VALIDATION: Compare AI dates vs pre-parsed dates
      // =====================================================================
      const aiDatesCount = metadata.dates?.length || 0;
      const preParseCount = preAnalysis.dateCount;
      const dateMismatch = Math.abs(aiDatesCount - preParseCount);
      
      console.log("=== DATE VALIDATION ===");
      console.log(`AI detected dates: ${aiDatesCount}`);
      console.log(`Pre-parse detected dates: ${preParseCount}`);
      console.log(`Mismatch: ${dateMismatch} dates`);
      
      // If mismatch is significant (>2 dates difference), prefer pre-parsed dates
      if (preParseCount > 0 && dateMismatch > 2) {
        console.warn(`WARNING: AI date count (${aiDatesCount}) differs significantly from pre-parsed count (${preParseCount}). Using pre-parsed dates.`);
        metadata.dates = preAnalysis.dates;
        console.log(`Corrected dates to: ${metadata.dates.join(', ')}`);
        sendEvent('warning', { 
          message: `Date count corrected: AI detected ${aiDatesCount} dates, but document structure shows ${preParseCount} dates. Using validated count.`
        });
      } else if (preParseCount > 0 && aiDatesCount !== preParseCount) {
        // Minor mismatch - log but don't override
        console.log(`INFO: Minor date count difference (AI: ${aiDatesCount}, Pre-parse: ${preParseCount}). Keeping AI dates.`);
      }
      
      // Log final pre-analysis summary for debugging
      console.log("=== FINAL PRE-ANALYSIS SUMMARY ===");
      console.log(`Document: ${req.file?.originalname || 'unknown'}`);
      console.log(`Days in EMAR: ${metadata.dates?.length || 0}`);
      console.log(`Dates: ${(metadata.dates || []).join(', ')}`);
      console.log(`Medications: ${metadata.medications?.length || 0}`);
      for (const med of (metadata.medications || [])) {
        const slots = med.scheduledTimeSlots?.join(', ') || 'all slots';
        console.log(`  - ${med.name}: ${slots}${med.isPRN ? ' (PRN)' : ''}`);
      }
      console.log(`Time slots: ${(metadata.timeSlots || []).join(', ')}`);
      console.log("==================================");
      
      sendProgress(18, "Validating medication count...", "count_validation");

      // =====================================================================
      // REUSABLE CONSENSUS HELPER - Run function multiple times and find agreement
      // =====================================================================
      const runConsensus = async <T>(
        fn: () => Promise<T>,
        passes: number = 3,
        compareFn: (a: T, b: T) => boolean = (a, b) => a === b
      ): Promise<{ result: T; consensus: boolean; results: T[] }> => {
        const results: T[] = [];
        const promises = Array.from({ length: passes }, () => fn());
        const resolved = await Promise.all(promises);
        results.push(...resolved);
        
        const frequency = new Map<string, { value: T; count: number }>();
        for (const result of results) {
          const key = JSON.stringify(result);
          if (!frequency.has(key)) {
            frequency.set(key, { value: result, count: 0 });
          }
          frequency.get(key)!.count++;
        }
        
        let bestResult: T = results[0];
        let bestCount = 0;
        let consensus = false;
        
        for (const entry of Array.from(frequency.values())) {
          const { value, count } = entry;
          if (count > bestCount) {
            bestCount = count;
            bestResult = value;
          }
          if (count >= 2) {
            consensus = true;
          }
        }
        
        return { result: bestResult, consensus, results };
      };

      // =====================================================================
      // MEDICATION COUNT VALIDATION (3-pass consensus with text extraction)
      // =====================================================================
      let agreedCount = 0;
      let forceMultiPass = false;
      const expectedEntriesPerMedication = new Map<number, number>();
      
      const medicationListPrompt = `Analyze the EMAR document text and list DISTINCT medications mentioned. Include strength and form if shown (e.g., "Paracetamol 500mg tablets"). Include PRN and topical items. Do NOT include headings, dates, times, routes, signatures or codes. Return JSON: {"medications": ["Med 1", "Med 2"]}.`;

      const normalizeMedicationKey = (name: string): string =>
        (name || "")
          .toLowerCase()
          .replace(/([a-z])(\d)/g, "$1 $2")
          .replace(/(\d)([a-z])/g, "$1 $2")
          .replace(/[^a-z0-9]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const PRN_TEXT_PATTERN = /\b(prn|as required|as needed|when required|when needed|if needed|as necessary|up to \d+\s*(?:times|tablets?|capsules?|puffs|drops?)\s*(?:daily|per day))\b/i;
      const isPrnFromText = (text: string): boolean => PRN_TEXT_PATTERN.test(text || "");

      const isLikelyMedicationLabel = (name: string): boolean => {
        const cleaned = (name || "").replace(/\s+/g, " ").trim();
        if (!cleaned || cleaned.length < 3) return false;
        if (!/[a-zA-Z]/.test(cleaned)) return false;
        const lower = cleaned.toLowerCase();
        if (["n/a", "na", "none", "unknown"].includes(lower)) return false;
        const blocked = [
          "medication",
          "medications",
          "medicine",
          "route",
          "dose",
          "dosage",
          "time",
          "time slot",
          "date",
          "signature",
          "initials",
          "administered",
          "emar",
          "chart",
          "record",
          "page",
          "allergy",
          "allergies",
          "service user",
          "patient",
          "name",
        ];
        if (blocked.some((term) => lower === term || lower.startsWith(`${term} `))) return false;
        if (/^\d{1,2}:\d{2}/.test(cleaned)) return false;
        return true;
      };

      const mergeMedicationMaps = (target: Map<string, string>, source: Map<string, string>) => {
        for (const [key, name] of source.entries()) {
          const existing = target.get(key);
          if (!existing || name.length > existing.length) {
            target.set(key, name);
          }
        }
      };

      const collectMedicationList = async (): Promise<Map<string, string>> => {
        const medsByKey = new Map<string, string>();
        const texts = (emarMode === "legacy" && Array.isArray(legacyTextChunks) && legacyTextChunks.length > 0)
          ? legacyTextChunks
          : [analysisText];

        for (const text of texts) {
          try {
            const response = await executeSecureTextCompletion({
              endpoint: "/api/ai/analyze-emar",
              feature: "emar_count_validation",
              model: emarValidationModel,
              userContext: aiUserContext,
              inputText: `List medications in this document:\n\n${text}`,
              systemPrompt: medicationListPrompt,
              temperature: 0,
              maxCompletionTokens: 500,
              seed: DETERMINISTIC_SEED,
              responseFormat: { type: "json_object" },
              useCache: false,
            });

            const content = response.restoredText || '{"medications":[]}';
            let parsed: any = null;
            try {
              parsed = JSON.parse(content);
            } catch {
              const match = content.match(/\{[\s\S]*\}/);
              parsed = match ? JSON.parse(match[0]) : { medications: [] };
            }
            const meds = Array.isArray(parsed.medications) ? parsed.medications : [];
            for (const m of meds) {
              const name = typeof m === "string" ? m.trim() : "";
              if (!name || !isLikelyMedicationLabel(name)) continue;
              const key = normalizeMedicationKey(name);
              if (!key) continue;
              const existing = medsByKey.get(key);
              if (!existing || name.length > existing.length) {
                medsByKey.set(key, name);
              }
            }
          } catch (e) {
            console.error(`Medication list extraction error:`, e);
          }
        }

        return medsByKey;
      };

      const countMedications = async (): Promise<{ count: number; medsByKey: Map<string, string> }> => {
        const medsByKey = await collectMedicationList();
        return { count: medsByKey.size, medsByKey };
      };
      
      // COST OPTIMIZATION: Single pass for count, only run consensus if mismatch
      const initialExtractedMedicationCount = metadata.medications?.length || 0;
      let extractedMedicationCount = initialExtractedMedicationCount;
      let combinedMedicationList = new Map<string, string>();
      let agreedMedicationCount = initialExtractedMedicationCount;
      let medicationCountConsensus = true;

      if (!metadataFromGrid) {
        const firstList = await countMedications();
        const firstCount = firstList.count;
        combinedMedicationList = new Map(firstList.medsByKey);
        agreedMedicationCount = firstCount;
        
        if (firstCount !== initialExtractedMedicationCount) {
          // Mismatch - run one more pass to confirm
          const secondList = await countMedications();
          const secondCount = secondList.count;
          mergeMedicationMaps(combinedMedicationList, secondList.medsByKey);
          if (secondCount === firstCount) {
            agreedMedicationCount = firstCount;
            console.log(`DEBUG: Medication count confirmed: ${agreedMedicationCount} (2 passes agreed)`);
          } else if (secondCount === initialExtractedMedicationCount) {
            agreedMedicationCount = initialExtractedMedicationCount;
            console.log(`DEBUG: Medication count matches metadata: ${agreedMedicationCount}`);
          } else {
            // Still mismatch, trust metadata
            agreedMedicationCount = initialExtractedMedicationCount;
            medicationCountConsensus = false;
            forceMultiPass = true;
            console.warn(`DEBUG: Medication count mismatch - using metadata: ${initialExtractedMedicationCount}`);
          }
        } else {
          console.log(`DEBUG: Medication count validated on first pass: ${agreedMedicationCount}`);
        }
      } else {
        for (const med of metadata.medications || []) {
          const name = typeof med?.name === "string" ? med.name.trim() : "";
          if (!name || !isLikelyMedicationLabel(name)) continue;
          const key = normalizeMedicationKey(name);
          if (!key) continue;
          combinedMedicationList.set(key, name);
        }
        console.log("DEBUG: Skipping AI medication count validation (grid metadata)");
      }

      // Merge deterministic grid-derived medication labels for reconciliation (if available)
      if (gridBaseline?.medications?.length) {
        const gridMap = new Map<string, string>();
        for (const med of gridBaseline.medications) {
          const name = typeof med?.name === "string" ? med.name.trim() : "";
          if (!name || !isLikelyMedicationLabel(name)) continue;
          const key = normalizeMedicationKey(name);
          if (!key) continue;
          const existing = gridMap.get(key);
          if (!existing || name.length > existing.length) {
            gridMap.set(key, name);
          }
        }
        mergeMedicationMaps(combinedMedicationList, gridMap);
      }

      // Reconcile missing medications into metadata so interactions and extraction cover them
      const existingMeds = metadata.medications || [];
      const existingKeys = new Set<string>();
      for (const med of existingMeds) {
        const key = normalizeMedicationKey(med?.name || "");
        if (key) existingKeys.add(key);
      }

      const missingMedicationNames: string[] = [];
      for (const [key, name] of combinedMedicationList.entries()) {
        if (!key || existingKeys.has(key)) continue;
        const isSimilar = existingMeds.some((m: any) => {
          const existingKey = normalizeMedicationKey(m?.name || "");
          if (!existingKey) return false;
          if (existingKey === key) return true;
          if (existingKey.length >= 6 && existingKey.includes(key)) return true;
          if (key.length >= 6 && key.includes(existingKey)) return true;
          return false;
        });
        if (isSimilar) continue;
        missingMedicationNames.push(name);
      }

      if (missingMedicationNames.length > 0) {
        sendProgress(22, `Reconciling ${missingMedicationNames.length} medications...`, "medication_reconciliation");
        const addedMeds = missingMedicationNames.map((name) => ({
          name,
          genericName: "",
          isPRN: false,
          instructions: "",
          requiredGapHours: 4,
          scheduledTimeSlots: [],
        }));
        metadata.medications = [...existingMeds, ...addedMeds];
        extractedMedicationCount = metadata.medications.length;
        console.log(`DEBUG: Added ${addedMeds.length} medications from reconciliation: ${addedMeds.map(m => m.name).join(", ")}`);
        sendEvent('warning', {
          message: `Medication reconciliation added ${addedMeds.length} medication(s) to avoid missing items. Please review the list.`
        });
      } else {
        extractedMedicationCount = metadata.medications?.length || 0;
      }

      const gridMedCount = gridBaseline?.medications?.length || 0;
      const gridDateCount = gridBaseline?.dates?.length || 0;
      const gridSlotCount = gridBaseline?.timeSlots?.length || 0;
      const aiMedCount = metadata.medications?.length || 0;
      const aiSlotCount = metadata.timeSlots?.length || 0;
      const gridCoverageRatio = aiMedCount > 0 ? gridMedCount / aiMedCount : 1;
      const MIN_GRID_MED_COUNT = 2;
      const gridLooksValid = Boolean(
        gridBaseline &&
          gridMedCount >= MIN_GRID_MED_COUNT &&
          gridDateCount >= 2 &&
          gridSlotCount >= 2
      );
      const aiLikelyOvercount =
        aiMedCount > gridMedCount &&
        aiMedCount - gridMedCount >= 2 &&
        gridCoverageRatio >= 0.6;
      const aiMissingStructure = aiDatesCount === 0 || aiSlotCount === 0;
      const shouldUseGridMetadata = gridLooksValid && (
        aiMedCount === 0 ||
        gridMedCount >= aiMedCount ||
        aiLikelyOvercount ||
        aiMissingStructure
      );

      const TIME_RANGE_PATTERN = /\b(?:\d{1,2}[:.][0-5]\d|\d{1,2}\s*(?:am|pm)|(?:[01]?\d|2[0-3])[0-5]\d)\s*[-–]\s*(?:\d{1,2}[:.][0-5]\d|\d{1,2}\s*(?:am|pm)|(?:[01]?\d|2[0-3])[0-5]\d)\b/gi;
      const CODE_TOKEN_PATTERN = /\b(AD|AS|P|R|MU|NH|SA|FA|F|S\s*\/\s*A|S\s*[-–]\s*A|F\s*\/\s*A|PRN\s*[-–]?\s*R|PRN\s*[-–]?\s*AD|PRN\s*[-–]?\s*AS|PRNAD|PRNAS|PRNR|PRN|MISSED|N\/?A)\b/i;

      const normalizeCodeText = (value: string): string => {
        if (!value) return "";
        return value
          .toUpperCase()
          .replace(/\bP\s*R\s*N\s*[-–]?\s*R\b/g, "PRN-R")
          .replace(/\bP\s*R\s*N\s*[-–]?\s*A\s*D\b/g, "PRN-AD")
          .replace(/\bP\s*R\s*N\s*[-–]?\s*A\s*S\b/g, "PRN-AS")
          .replace(/\bP\s*R\s*N\b/g, "PRN")
          .replace(/\bS\s*[-–\/]?\s*A\b/g, "SA")
          .replace(/\bF\s*[-–\/]?\s*A\b/g, "F")
          .replace(/\bN\s*\/\s*H\b/g, "NH")
          .replace(/\bM\s*\/\s*U\b/g, "MU")
          .replace(/\bA\s*\/\s*D\b/g, "AD")
          .replace(/\bA\s*\/\s*S\b/g, "AS")
          .replace(/\bN\s*H\b/g, "NH")
          .replace(/\bM\s*U\b/g, "MU")
          .replace(/\bA\s*D\b/g, "AD")
          .replace(/\bA\s*S\b/g, "AS")
          .replace(/\bF\b/g, "F");
      };

      const normalizeCellCode = (raw: unknown): string => {
        if (typeof raw !== "string") return "";
        let code = raw
          .toUpperCase()
          .trim()
          .replace(/[()\[\]{}]/g, "")
          .replace(/[–—]/g, "-")
          .replace(/\s+/g, "");

        if (!code) return "";

        if (code === "F" || code === "FA" || code === "FAMILY" || code === "FAM" || code === "F/A") return "F";
        if (code === "S/A" || code === "S-A") return "SA";
        if (code === "M/U" || code === "MU") return "MU";
        if (code === "N/H" || code === "NH") return "NH";
        if (code === "A/D") return "AD";
        if (code === "A/S") return "AS";
        if (code === "PRNAD" || code === "PRN-AD") return "PRN-AD";
        if (code === "PRNAS" || code === "PRN-AS") return "PRN-AS";
        if (code === "PRNR" || code === "PRN-R" || code === "PRNREFUSED" || code === "PRNREFUS") return "PRN-R";
        if (code === "PRNRF" || code === "PRNREF") return "PRN-R";
        if (code === "PRN" + "R") return "PRN-R";
        if (code === "NOTHOME" || code === "NH") return "NH";
        if (code === "SELADMIN" || code === "SELFADMIN" || code === "SA") return "SA";
        if (code === "MEDUNAV" || code === "MEDUNAVAILABLE" || code === "UNAVAILABLE" || code === "MU") return "MU";
        if (code === "REFUSED" || code === "REFUSE" || code === "REF") return "R";
        if (code === "NA") return "N/A";

        // Restore dash form for PRN-R if written as PRN-R but stripped
        if (code === "PRN-R") return "PRN-R";
        if (code === "PRNR") return "PRN-R";

        return code;
      };

      const extractCellCode = (value: unknown): string => {
        const text = String(value || "");
        if (!text.trim()) return "";
        const normalizedText = normalizeCodeText(text);
        const match = normalizedText.match(CODE_TOKEN_PATTERN);
        if (!match) return "";
        return normalizeCellCode(match[1]);
      };
      const hasExplicitTimeInCell = (cell: ParsedEMAR["cells"][number]) => {
        if (cell.time && cell.time.trim()) return true;
        const content = String(cell.content || "").replace(TIME_RANGE_PATTERN, " ");
        const timeRegex = /\b(?:\d{1,2}[:.][0-5]\d|\d{1,2}\s*(?:am|pm)|(?:[01]?\d|2[0-3])[0-5]\d)\b/i;
        return timeRegex.test(content);
      };

      gridNonBlankCount = gridBaseline?.cells?.reduce((count, cell) => {
        const code = normalizeCellCode(cell.code);
        if (code && code !== "BLANK" && code !== "N/A") return count + 1;
        const contentCode = extractCellCode(cell.content);
        if (contentCode && contentCode !== "N/A") return count + 1;
        const hasTime = hasExplicitTimeInCell(cell);
        const hasInitials = Boolean(cell.careWorker && cell.careWorker.trim());
        if (hasTime || hasInitials) return count + 1;
        return count;
      }, 0) || 0;
      gridPrimaryEnabled = gridLooksValid && gridNonBlankCount > 0;

      if (gridBaseline?.cells?.length) {
        gridPrnKeys = new Set<string>();
        for (const cell of gridBaseline.cells) {
          const key = normalizeMedicationKey(cell.medication || "");
          if (!key) continue;
          const cellMedId = Number((cell as any)?.medicationId) || 0;
          const raw = normalizeCellCode(cell.code);
          const code = raw && raw !== "BLANK" && raw !== "N/A" ? raw : extractCellCode(cell.content);
          if (code) {
            if (!gridPrnStats.has(key)) gridPrnStats.set(key, { prnCount: 0, nonBlankCount: 0 });
            const stats = gridPrnStats.get(key)!;
            if (code !== "N/A") {
              stats.nonBlankCount += 1;
            }
            if (code.startsWith("PRN")) {
              stats.prnCount += 1;
              gridPrnKeys.add(key);
            }

            if (cellMedId > 0) {
              if (!gridPrnStatsByMedId.has(cellMedId)) {
                gridPrnStatsByMedId.set(cellMedId, { prnCount: 0, nonBlankCount: 0 });
              }
              const byIdStats = gridPrnStatsByMedId.get(cellMedId)!;
              if (code !== "N/A") {
                byIdStats.nonBlankCount += 1;
              }
              if (code.startsWith("PRN")) {
                byIdStats.prnCount += 1;
              }
            }
          }
        }
      }

      const getGridPrnStatsForMed = (name: string, medicationId?: number) => {
        const medId = Number(medicationId) || 0;
        if (medId > 0) {
          const directById = gridPrnStatsByMedId.get(medId);
          if (directById) return directById;
        }
        const key = normalizeMedicationKey(name || "");
        if (!key) return undefined;
        const direct = gridPrnStats.get(key);
        if (direct) return direct;
        let best: { stats: { prnCount: number; nonBlankCount: number }; score: number } | null = null;
        for (const [candidateKey, stats] of gridPrnStats.entries()) {
          if (!candidateKey) continue;
          if (candidateKey.includes(key) || key.includes(candidateKey)) {
            const score = Math.min(candidateKey.length, key.length);
            if (!best || score > best.score) {
              best = { stats, score };
            }
          }
        }
        return best && best.score >= 6 ? best.stats : undefined;
      };

      if (Array.isArray(metadata.medications) && metadata.medications.length > 0 && gridPrnStats.size > 0) {
        metadata.medications = metadata.medications.map((med: any) => {
          const name = typeof med?.name === "string" ? med.name : "";
          const instructions = typeof med?.instructions === "string" ? med.instructions : "";
          const textIndicatesPrn = isPrnFromText(`${name} ${instructions}`.trim());
          const stats = getGridPrnStatsForMed(name);
          const nonBlankCount = stats?.nonBlankCount || 0;
          const prnCount = stats?.prnCount || 0;
          const prnRatio = nonBlankCount > 0 ? prnCount / nonBlankCount : 0;
          const gridPrnStrong = Boolean(stats && prnCount >= 2 && prnRatio >= 0.5);
          const aiIndicatesPrn = Boolean(med?.isPRN);
          const hasInstructionText = Boolean(instructions && instructions.trim());
          const isPrn = textIndicatesPrn || gridPrnStrong || (aiIndicatesPrn && !textIndicatesPrn && !gridPrnStrong && !hasInstructionText);
          return { ...med, isPRN: isPrn };
        });
      }

      if (shouldUseGridMetadata && gridBaseline && !metadataFromGrid) {
        const aiMedByKey = new Map<string, any>();
        for (const med of metadata.medications || []) {
          const key = normalizeMedicationKey(med?.name || "");
          if (key) aiMedByKey.set(key, med);
        }

        const mergedGridMeds = gridBaseline.medications
          .map((med) => {
            const name = typeof med?.name === "string" ? med.name.trim() : "";
            if (!name) return null;
            const key = normalizeMedicationKey(name);
            const aiMed = key ? aiMedByKey.get(key) : null;
            const aiInstructions = typeof aiMed?.instructions === "string" ? aiMed.instructions : "";
            const gridInstructions = typeof med?.instructions === "string" ? med.instructions : "";
            const instructions = aiInstructions.length >= gridInstructions.length ? aiInstructions : gridInstructions;
            const prnText = `${name} ${instructions}`.trim();
            const textIndicatesPrn = isPrnFromText(prnText);
            const aiIndicatesPrn = Boolean(aiMed?.isPRN);
            const stats = key ? gridPrnStats.get(key) : undefined;
            const nonBlankCount = stats?.nonBlankCount || 0;
            const prnRatio = nonBlankCount > 0 ? (stats?.prnCount || 0) / nonBlankCount : 0;
            const gridPrnStrong = Boolean(stats && stats.prnCount >= 2 && prnRatio >= 0.5);
            const hasGridEvidence = Boolean(stats && nonBlankCount > 0);
            const isPrn = textIndicatesPrn || gridPrnStrong || (aiIndicatesPrn && !hasGridEvidence);
            const scheduledTimeSlots = Array.isArray(aiMed?.scheduledTimeSlots) && aiMed.scheduledTimeSlots.length > 0
              ? aiMed.scheduledTimeSlots
              : Array.isArray(med?.timeSlots) ? med.timeSlots : [];
            return {
              name,
              gridMedicationId: typeof (med as any)?.row === "number" ? (med as any).row + 1 : undefined,
              genericName: aiMed?.genericName || "",
              isPRN: isPrn,
              instructions,
              requiredGapHours: aiMed?.requiredGapHours || 4,
              scheduledTimeSlots,
              timeSlots: Array.isArray(med?.timeSlots) ? med.timeSlots : Array.isArray(aiMed?.timeSlots) ? aiMed.timeSlots : []
            };
          })
          .filter(Boolean);

        if (mergedGridMeds.length > 0) {
          metadata.medications = mergedGridMeds as any[];
          if (gridBaseline.dates?.length) metadata.dates = gridBaseline.dates;
          if (gridBaseline.timeSlots?.length) metadata.timeSlots = gridBaseline.timeSlots;

          extractedMedicationCount = metadata.medications.length;
          agreedMedicationCount = metadata.medications.length;
          medicationCountConsensus = true;
          sendEvent('warning', {
            message: `Grid parser detected ${gridMedCount} medications. Using grid-derived medication list for accuracy.`
          });
        }
      }
      
      const gridServiceUserInitials = gridBaseline?.serviceUserName
        ? normalizeInitials(gridBaseline.serviceUserName)
        : "N.N.";
      const textDerivedInitials = normalizeInitials(serviceUserFullName);
      const aiServiceUserInitials = normalizeInitials(metadata.serviceUserInitials);
      metadata.serviceUserInitials =
        gridServiceUserInitials !== "N.N."
          ? gridServiceUserInitials
          : textDerivedInitials !== "N.N."
          ? textDerivedInitials
          : aiServiceUserInitials;

      sendProgress(25, "Count validation complete...", "count_complete");

      // Ensure deterministic medication ordering before assigning IDs.
      if (Array.isArray(metadata.medications) && metadata.medications.length > 1) {
        const getMedSortKey = (med: any) =>
          (med?.name || "")
            .toString()
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        metadata.medications = [...metadata.medications].sort((a: any, b: any) => {
          const aKey = getMedSortKey(a);
          const bKey = getMedSortKey(b);
          if (aKey !== bKey) return aKey.localeCompare(bKey);
          const aInstr = (a?.instructions || "").toString();
          const bInstr = (b?.instructions || "").toString();
          if (aInstr !== bInstr) return aInstr.localeCompare(bInstr);
          const aGeneric = (a?.genericName || "").toString();
          const bGeneric = (b?.genericName || "").toString();
          return aGeneric.localeCompare(bGeneric);
        });
      }

      if (Array.isArray(metadata.medications)) {
        metadata.medications = metadata.medications.map((med: any) => {
          const name = typeof med?.name === "string" ? med.name : "";
          const genericName = typeof med?.genericName === "string" ? med.genericName : "";
          return {
            ...med,
            genericName: genericName || inferGenericNameFromMedicationLabel(name),
          };
        });
      }

      // =====================================================================
      // DRUG INTERACTION CHECK (post-reconciliation)
      // =====================================================================
      if (Array.isArray(metadata.medications) && metadata.medications.length >= 2) {
        sendProgress(26, "Checking for drug interactions...", "drug_interaction_check");
        drugInteractions = await checkDrugInteractions(metadata.medications, aiUserContext);
      } else {
        sendProgress(26, "Skipping drug interaction check (insufficient meds)...", "drug_interaction_check");
      }
      if (drugInteractions.length > 0) {
        console.log(`DEBUG: Found ${drugInteractions.length} potential drug interactions`);
        const highSeverity = drugInteractions.filter(d => d.severity === 'high').length;
        if (highSeverity > 0) {
          sendEvent('warning', { 
            message: `ALERT: ${highSeverity} high-severity drug interaction(s) detected. Review medications carefully.`
          });
        }
      }

      // Phase 2: Extract entries using per-medication prompts for reliability
      // Assign each medication an index for deterministic matching
      const medicationsWithIds = (metadata.medications || []).map((m: any, i: number) => ({
        ...m,
        medicationId: i + 1  // 1-indexed for easier human readability
      }));
      const prnMedicationIds = new Set<number>();
      for (const med of medicationsWithIds) {
        if (med?.isPRN) prnMedicationIds.add(med.medicationId);
      }
      
      // COST OPTIMIZATION: Process 3 medications per batch (reduced from 1)
      // This cuts API calls by ~66% while maintaining good accuracy
      const batchSize = 3;
      const medicationBatches: any[][] = [];
      for (let i = 0; i < medicationsWithIds.length; i += batchSize) {
        medicationBatches.push(medicationsWithIds.slice(i, i + batchSize));
      }
      
      console.log(`DEBUG: Processing ${medicationsWithIds.length} medications in ${medicationBatches.length} batches (${batchSize} per batch)`);
      sendProgress(30, `Processing ${medicationsWithIds.length} medications in ${medicationBatches.length} batches...`, "extraction_start");
      
      // =====================================================================
      // 3-PASS EXTRACTION WITH CONSENSUS VOTING (Vision API)
      // Run 3 independent extraction passes, accept when 2+ agree
      // =====================================================================
      
      // Regex pattern for time validation (used throughout extraction flow)
      const TIME_REGEX = /^(?:(?:0?[0-9]|1[0-9]|2[0-3])[:.]?[0-5][0-9]|(?:0?[0-9]|1[0-2])[:.]?[0-5][0-9]\s*(?:am|pm|AM|PM))$/;
      
      // Helper to compute hasTime deterministically from entry
      const computeHasTime = (entry: any): boolean => {
        const timeStr = String(entry.time || "").trim();
        if (
          timeStr === "" ||
          timeStr === "-" ||
          timeStr === "--" ||
          timeStr.toLowerCase() === "n/a" ||
          timeStr.toLowerCase() === "na" ||
          timeStr.toLowerCase() === "null" ||
          timeStr === "0"
        ) {
          return false;
        }

        // Treat time-slot ranges as missing explicit admin times.
        const rangePattern = /\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}/;
        if (rangePattern.test(timeStr)) return false;

        // Accept a single time token anywhere in the field.
        if (TIME_REGEX.test(timeStr)) return true;
        const tokenMatch = timeStr.match(/\b(?:0?[0-9]|1[0-9]|2[0-3])[:.]?[0-5][0-9](?:\s*(?:am|pm|AM|PM))?\b/);
        return !!tokenMatch;
      };

      const normalizeEmarCode = (raw: unknown): string => normalizeCellCode(raw);

      const inferGridCode = (cell: ParsedEMAR["cells"][number], medId: number): string => {
        const rawCode = String(cell.code || "").toUpperCase().trim();
        let normalized = normalizeEmarCode(rawCode);
        if (!normalized || normalized === "BLANK" || normalized === "N/A") {
          const contentCode = extractCellCode(cell.content);
          if (contentCode) {
            normalized = normalizeEmarCode(contentCode);
          }
        }

        const hasTime = hasExplicitTimeInCell(cell);
        const hasInitials = Boolean(cell.careWorker && cell.careWorker.trim());

        const looksPrn = normalized.startsWith("PRN");

        if (looksPrn && !hasTime) {
          return "PRN-R";
        }
        if (normalized && normalized !== "BLANK" && normalized !== "N/A") return normalized;

        if (hasTime || hasInitials) {
          return prnMedicationIds.has(medId) || looksPrn ? "PRN" : "AD";
        }
        return normalized || "BLANK";
      };

      // Helper function to normalize entries for comparison (sort by medicationId, date, timeSlot, code)
      // IMPORTANT: Includes hasTime for documentation completeness
      const normalizeEntries = (entries: any[]): any[] => {
        return entries
          .map((e: any) => {
            let timeSlot = (e.timeSlot || "").trim().toUpperCase();
            timeSlot = timeSlot.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
            let date = (e.date || "").trim().toUpperCase();
            
            return {
              medicationId: Number(e.medicationId) || 0,
              date: date,
              timeSlot: timeSlot,
              code: (e.code || "").toUpperCase().trim(),
              careWorkerInitials: (e.careWorkerInitials || "").toUpperCase().trim(),
              hasTime: computeHasTime(e), // Include hasTime for PRN consensus
              time: e.time // Preserve original time field
            };
          })
          .sort((a, b) => {
            if (a.medicationId !== b.medicationId) return a.medicationId - b.medicationId;
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.timeSlot !== b.timeSlot) return a.timeSlot.localeCompare(b.timeSlot);
            return a.code.localeCompare(b.code);
          });
      };
      
      // Helper function to create hash of normalized entries for comparison
      const hashEntries = (entries: any[]): string => {
        const normalized = normalizeEntries(entries);
        return JSON.stringify(normalized);
      };
      
      // Helper function to create hash of a SINGLE normalized entry (for per-entry consensus)
      // Note: hasTime is explicitly included for documentation completeness
      const hashSingleEntry = (entry: any): string => {
        let timeSlot = (entry.timeSlot || "").trim().toUpperCase();
        timeSlot = timeSlot.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
        let date = (entry.date || "").trim().toUpperCase();
        
        const normalized = {
          medicationId: Number(entry.medicationId) || 0,
          date: date,
          timeSlot: timeSlot,
          code: (entry.code || "").toUpperCase().trim(),
          careWorkerInitials: (entry.careWorkerInitials || "").toUpperCase().trim(),
          hasTime: computeHasTime(entry) // Use shared helper for consistency
        };
        return JSON.stringify(normalized);
      };
      
      const normalizeSlotKey = (entry: any): string => {
        const medId = Number(entry.medicationId) || 0;
        const date = String(entry.date || "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, " ");
        let timeSlot = String(entry.timeSlot || "").trim().toUpperCase();
        timeSlot = timeSlot.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
        return `${medId}|${date}|${timeSlot}`;
      };

      // Prefer refusals/verification codes when de-duplicating slot entries.
      const codePriority: Record<string, number> = {
        "PRN-R": 100,
        "R": 100,
        "MISSED": 95,
        "MU": 90,
        "NH": 90,
        "SA": 88,
        "F": 88,
        "PRN-AD": 82,
        "PRN-AS": 82,
        "PRN": 80,
        "AD": 65,
        "AS": 65,
        "P": 60,
        "N/A": 10,
        "BLANK": 0
      };

      const computeEntryScore = (entry: any): number => {
        const code = normalizeEmarCode(entry.code || "");
        let score = codePriority[code] ?? (code ? 60 : 0);
        if (computeHasTime(entry)) score += 5;
        const initials = String(entry.careWorkerInitials || "").toUpperCase().trim();
        if (initials && initials !== "MANUAL") score += 3;
        if (String(entry.time || "").trim()) score += 1;
        return score;
      };

      const shouldReplaceEntry = (current: any, candidate: any): boolean => {
        const currentScore = computeEntryScore(current);
        const candidateScore = computeEntryScore(candidate);
        if (candidateScore !== currentScore) return candidateScore > currentScore;

        const currentHasTime = computeHasTime(current);
        const candidateHasTime = computeHasTime(candidate);
        if (currentHasTime !== candidateHasTime) return candidateHasTime;

        const currentInitials = String(current.careWorkerInitials || "").toUpperCase().trim();
        const candidateInitials = String(candidate.careWorkerInitials || "").toUpperCase().trim();
        if (currentInitials !== candidateInitials) {
          if (candidateInitials && candidateInitials !== "MANUAL") return true;
          if (currentInitials && !candidateInitials) return false;
        }

        const currentCode = normalizeEmarCode(current.code || "");
        const candidateCode = normalizeEmarCode(candidate.code || "");
        if (candidateCode !== currentCode) {
          return candidateCode.length > currentCode.length;
        }

        return false;
      };

      // Helper function to deduplicate entries
      const deduplicateEntries = (entries: any[]): any[] => {
        const bestByKey = new Map<string, any>();
        for (const entry of entries) {
          const key = normalizeSlotKey(entry);
          if (!bestByKey.has(key)) {
            bestByKey.set(key, entry);
            continue;
          }
          const existing = bestByKey.get(key);
          if (shouldReplaceEntry(existing, entry)) {
            bestByKey.set(key, entry);
          }
        }
        return Array.from(bestByKey.values());
      };

      // Function to run one complete extraction pass using text extraction
      const runExtractionPass = async (passNumber: number): Promise<any[]> => {
        console.log(`DEBUG: Starting text extraction pass ${passNumber}`);

        const useChunkedLegacyScan =
          emarMode === "legacy" &&
          Array.isArray(legacyTextChunks) &&
          legacyTextChunks.length > 1;

        if (useChunkedLegacyScan) {
          const medList = medicationsWithIds
            .map(
              (m: any) =>
                `[ID:${m.medicationId}] ${m.name}${m.isPRN ? " (PRN)" : ""}`
            )
            .join("\n");

          const exampleMedicationId = medicationsWithIds[0]?.medicationId || 1;

          const prompt = `You are an EMAR data extractor analyzing EMAR document text. Extract administration records ONLY for these specific medications:

MEDICATIONS TO FIND (use exact medicationId in output):
${medList}

DATES FROM DOCUMENT: ${metadata.dates?.join(", ")}
TIME SLOTS: ${metadata.timeSlots?.join(", ")}
${correctionsContext}
ANALYZE THE DOCUMENT TEXT:
1. Find all entries for the medication(s) listed above
2. Extract the care worker initials (typically 2 letters)
3. Identify administration codes and times

Return JSON with entries ONLY for the medications listed above:
{
  "entries": [
    {"medicationId": ${exampleMedicationId}, "date": "Sat, 06 Dec", "timeSlot": "08:00-09:00", "code": "AD", "careWorkerInitials": "RK", "time": "08:30", "hasTime": true, "isOfficeClosed": false},
    {"medicationId": ${exampleMedicationId}, "date": "Sun, 07 Dec", "timeSlot": "08:00-09:00", "code": "AS", "careWorkerInitials": "", "time": "", "hasTime": false, "isOfficeClosed": false}
  ]
}

CODES TO LOOK FOR (be thorough - don't miss any):
- AD (administered), AS (assisted), P (prompted) - regular medications
    - PRN (given as needed) - PRN medications when given/administered
    - PRN-AD / PRN-AS - PRN administered/assisted (some systems)
    - PRN-R (PRN refused) - PRN medications refused when explicitly indicated
- R (refused) - medication was refused by service user - VERY IMPORTANT TO CAPTURE
- MU (medication unavailable), NH (not home)
- SA (self-administered), F (family administered)
- MISSED - for missed doses

CRITICAL: FOR EVERY ENTRY YOU MUST INCLUDE "hasTime" BOOLEAN:
- hasTime: true = a specific time is recorded in the document (e.g., "08:30", "14:15")
- hasTime: false = NO time is recorded, just initials or code present

    PRN MEDICATION GUIDANCE:
    - PRN (usually shown in blue) means administered as needed
    - PRN-AD / PRN-AS may appear and should be preserved when shown
    - PRN without a recorded time (red) means PRN refused -> use PRN-R
    - Apply PRN/PRN-R only if the medication is marked PRN in the prescription
    - Use R for refusals on non-PRN medications
    - Still set hasTime accurately for documentation completeness

DATE ASSIGNMENT RULES (CRITICAL - prevents cross-day errors):
1. The EMAR is a grid with DATE COLUMNS. Each date appears in the header row.
2. Each medication row intersects with each date column. An entry belongs to whichever date column it appears under.
3. ONLY assign a date to an entry if you can clearly determine which column it belongs to.
4. The dates available are: ${metadata.dates?.join(", ")}
5. If you cannot determine which date column an entry belongs to, DO NOT include that entry.
6. NEVER assign the same date to entries that appear in different columns of the EMAR grid.

OTHER CRITICAL RULES:
1. ALWAYS extract R codes - refusals are critical for compliance. Look for "R", "Ref", "Refused", "Declined"
2. Look for ALL entries including those with codes R, MU, NH - these are just as important as AD/AS/P
3. Care worker initials are typically 2 letters (e.g., RK, HB, BB, GM, SB)
4. Skip only truly blank/empty cells - but capture ALL cells with any code or initials
    5. For PRN meds: if PRN has no time recorded, treat it as PRN-R. For non-PRN meds, use R for refusals.

CARE WORKER INITIALS (IMPORTANT):
- If no initials are present in the cell, leave careWorkerInitials as an empty string.
- Do NOT infer office-closed/manual entries unless the document explicitly says so.
- isOfficeClosed should be false unless explicitly indicated in the document.
- DO NOT confuse medication codes (AS, AD, P, R, MU, NH, SA, F, PRN) for care worker initials - MEDICATION CODES ARE NEVER INITIALS!`;

          const chunkPromises = legacyTextChunks.map(async (chunkText, chunkIndex) => {
            try {
              const response = await executeSecureTextCompletion({
                endpoint: "/api/admin/emar-audit",
                feature: "emar_extraction",
                model: emarExtractionModel,
                userContext: aiUserContext,
                systemPrompt: prompt,
                inputText: `Extract medication entries from this document chunk (${chunkIndex + 1}/${legacyTextChunks.length}):\n\n${chunkText}`,
                temperature: 0,
                maxCompletionTokens: 8000,
                seed: DETERMINISTIC_SEED,
                responseFormat: { type: "json_object" },
                useCache: false,
              });

              const content = response.restoredText || '{"entries":[]}';
              const data = parseJsonFromContent(content) || { entries: [] };
              const chunkEntries = data.entries || [];
              console.log(
                `DEBUG: Pass ${passNumber} Chunk ${chunkIndex + 1}/${legacyTextChunks.length} extracted ${chunkEntries.length} entries`
              );
              return chunkEntries;
            } catch (e) {
              console.error(
                `Pass ${passNumber} Chunk ${chunkIndex + 1}/${legacyTextChunks.length} error:`,
                e
              );
            }
            return [];
          });

          const chunkResults = await Promise.all(chunkPromises);
          const rawEntries = chunkResults.flat();
          const dedupedEntries = deduplicateEntries(rawEntries);

          console.log(
            `DEBUG: Pass ${passNumber} extracted ${rawEntries.length} raw, ${dedupedEntries.length} after dedup (legacy chunk scan)`
          );
          return dedupedEntries;
        }
        
        const batchPromises = medicationBatches.map(async (batch, batchIndex) => {
          const batchMedList = batch.map((m: any) => 
            `[ID:${m.medicationId}] ${m.name}${m.isPRN ? ' (PRN)' : ''}`
          ).join("\n");
          
          const batchPrompt = `You are an EMAR data extractor analyzing EMAR document text. Extract administration records ONLY for these specific medications:

MEDICATIONS TO FIND (use exact medicationId in output):
${batchMedList}

DATES FROM DOCUMENT: ${metadata.dates?.join(", ")}
TIME SLOTS: ${metadata.timeSlots?.join(", ")}
${correctionsContext}
ANALYZE THE DOCUMENT TEXT:
1. Find all entries for the medication(s) listed above
2. Extract the care worker initials (typically 2 letters)
3. Identify administration codes and times

Return JSON with entries ONLY for the medications listed above:
{
  "entries": [
    {"medicationId": ${batch[0].medicationId}, "date": "Sat, 06 Dec", "timeSlot": "08:00-09:00", "code": "AD", "careWorkerInitials": "RK", "time": "08:30", "hasTime": true, "isOfficeClosed": false},
    {"medicationId": ${batch[0].medicationId}, "date": "Sun, 07 Dec", "timeSlot": "08:00-09:00", "code": "AS", "careWorkerInitials": "", "time": "", "hasTime": false, "isOfficeClosed": false}
  ]
}

CODES TO LOOK FOR (be thorough - don't miss any):
- AD (administered), AS (assisted), P (prompted) - regular medications
- PRN (given as needed) - PRN medications when given/administered
- PRN-AD / PRN-AS - PRN administered/assisted (some systems)
- PRN-R (PRN refused) - PRN medications refused when explicitly indicated
- R (refused) - medication was refused by service user - VERY IMPORTANT TO CAPTURE
- MU (medication unavailable), NH (not home)
- SA (self-administered), F (family administered)
- MISSED - for missed doses

CRITICAL: FOR EVERY ENTRY YOU MUST INCLUDE "hasTime" BOOLEAN:
- hasTime: true = a specific time is recorded in the document (e.g., "08:30", "14:15")
- hasTime: false = NO time is recorded, just initials or code present

PRN MEDICATION GUIDANCE:
- PRN (usually shown in blue) means administered as needed
- PRN-AD / PRN-AS may appear and should be preserved when shown
- PRN without a recorded time (red) means PRN refused -> use PRN-R
- Apply PRN/PRN-R only if the medication is marked PRN in the prescription
- Use R for refusals on non-PRN medications
- Still set hasTime accurately for documentation completeness

DATE ASSIGNMENT RULES (CRITICAL - prevents cross-day errors):
1. The EMAR is a grid with DATE COLUMNS. Each date appears in the header row.
2. Each medication row intersects with each date column. An entry belongs to whichever date column it appears under.
3. ONLY assign a date to an entry if you can clearly determine which column it belongs to.
4. The dates available are: ${metadata.dates?.join(", ")}
5. If you cannot determine which date column an entry belongs to, DO NOT include that entry.
6. NEVER assign the same date to entries that appear in different columns of the EMAR grid.

OTHER CRITICAL RULES:
1. ALWAYS extract R codes - refusals are critical for compliance. Look for "R", "Ref", "Refused", "Declined"
2. Look for ALL entries including those with codes R, MU, NH - these are just as important as AD/AS/P
3. Care worker initials are typically 2 letters (e.g., RK, HB, BB, GM, SB)
4. Skip only truly blank/empty cells - but capture ALL cells with any code or initials
5. For PRN meds: if PRN has no time recorded, treat it as PRN-R. For non-PRN meds, use R for refusals.

CARE WORKER INITIALS (IMPORTANT):
- If no initials are present in the cell, leave careWorkerInitials as an empty string.
- Do NOT infer office-closed/manual entries unless the document explicitly says so.
- isOfficeClosed should be false unless explicitly indicated in the document.
- DO NOT confuse medication codes (AS, AD, P, R, MU, NH, SA, F, PRN) for care worker initials - MEDICATION CODES ARE NEVER INITIALS!`;
          
          try {
            const response = await executeSecureTextCompletion({
              endpoint: "/api/admin/emar-audit",
              feature: "emar_extraction",
              model: emarExtractionModel,
              userContext: aiUserContext,
              systemPrompt: batchPrompt,
              inputText: `Extract medication entries from this document:\n\n${analysisText}`,
              temperature: 0,
              maxCompletionTokens: 8000,
              seed: DETERMINISTIC_SEED,
              responseFormat: { type: "json_object" },
              useCache: false,
            });
            
            const content = response.restoredText || '{"entries":[]}';
            const data = parseJsonFromContent(content) || { entries: [] };
            const batchEntries = data.entries || [];
            console.log(`DEBUG: Pass ${passNumber} Batch ${batchIndex + 1} extracted ${batchEntries.length} entries`);
            return batchEntries;
          } catch (e) {
            console.error(`Pass ${passNumber} Batch ${batchIndex + 1} error:`, e);
          }
          return [];
        });
        
        const batchResults = await Promise.all(batchPromises);
        const rawEntries = batchResults.flat();
        const dedupedEntries = deduplicateEntries(rawEntries);
        
        console.log(`DEBUG: Pass ${passNumber} extracted ${rawEntries.length} raw, ${dedupedEntries.length} after dedup`);
        return dedupedEntries;
      };
      
      // =====================================================================
      // 3-PASS PARALLEL EXTRACTION with per-entry consensus
      // All passes run in parallel - highest entry count wins if no agreement
      // =====================================================================

      let extractedEntries: any[] = [];
      let consensusStatus: "single_pass" | "verified" | "no_consensus" = "single_pass";
      let consensusDetails: {
        pass1Count: number;
        pass2Count?: number;
        pass3Count?: number;
        matchingPasses: number[];
        fallbackPassUsed?: number;
        escalationReason?: string;
      } = {
        pass1Count: 0,
        pass2Count: 0,
        pass3Count: 0,
        matchingPasses: []
      };

      let pass1Entries: any[] = [];
      let pass2Entries: any[] = [];
      let pass3Entries: any[] = [];

      const buildGridEntries = () => {
        if (!gridBaseline?.cells?.length) return [];

        const medIdByKey = new Map<string, number>();
        for (const med of medicationsWithIds) {
          const key = normalizeMedicationKey(med?.name || "");
          if (key) medIdByKey.set(key, med.medicationId);
        }

        const resolveMedicationId = (name: string): number | null => {
          const key = normalizeMedicationKey(name || "");
          if (!key) return null;
          const direct = medIdByKey.get(key);
          if (direct) return direct;
          let bestId: number | null = null;
          let bestScore = 0;
          for (const [candidateKey, id] of medIdByKey.entries()) {
            if (!candidateKey) continue;
            const hit = candidateKey.includes(key) || key.includes(candidateKey);
            if (!hit) continue;
            const score = Math.min(candidateKey.length, key.length);
            if (score > bestScore) {
              bestScore = score;
              bestId = id;
            }
          }
          return bestScore >= 6 ? bestId : null;
        };

        const entries: any[] = [];
        for (const cell of gridBaseline.cells) {
          const medId = resolveMedicationId(cell.medication || "");
          if (!medId) continue;
          const code = inferGridCode(cell, medId);
          if (!code || code === "BLANK" || code === "N/A") continue;
          const entry: any = {
            medicationId: medId,
            date: cell.date || "",
            timeSlot: cell.timeSlot || "",
            code,
            careWorkerInitials: cell.careWorker || "",
            time: cell.time || "",
            hasTime: false,
            isOfficeClosed: false
          };
          entry.hasTime = computeHasTime(entry);
          entries.push(entry);
        }
        return deduplicateEntries(entries);
      };

      if (gridPrimaryEnabled) {
        sendProgress(35, "Using deterministic grid extraction...", "extraction_running");
        extractedEntries = buildGridEntries();
        consensusStatus = "verified";
        consensusDetails = {
          pass1Count: extractedEntries.length,
          pass2Count: 0,
          pass3Count: 0,
          matchingPasses: [1],
          fallbackPassUsed: 0,
          escalationReason: "Grid parser extraction (deterministic)"
        };
        extractionMethod = "grid-parser";
        console.log(`DEBUG: Grid primary extraction produced ${extractedEntries.length} entries`);
      } else {
        console.log("DEBUG: Running 3-pass parallel text extraction");
        sendProgress(35, "Extracting medication records...", "extraction_running");

        [pass1Entries, pass2Entries, pass3Entries] = await Promise.all([
          runExtractionPass(1),
          runExtractionPass(2),
          runExtractionPass(3)
        ]);

        extractedEntries = pass1Entries;
        consensusStatus = "single_pass";
        consensusDetails = {
          pass1Count: pass1Entries.length,
          pass2Count: pass2Entries.length,
          pass3Count: pass3Entries.length,
          matchingPasses: []
        };

        console.log(`DEBUG: Pass counts - P1: ${pass1Entries.length}, P2: ${pass2Entries.length}, P3: ${pass3Entries.length}`);
      }
      
      if (!gridPrimaryEnabled) {
      // =====================================================================
      // VALIDATED 3-PASS APPROACH: Use per-entry consensus
      // Validates entries against domain constraints to prevent hallucinated data
      // =====================================================================
      
      // Domain constraints for validation
      const validMedicationIds = new Set(medicationsWithIds.map((m: any) => m.medicationId));
      const validCodes = new Set(["AD", "AS", "P", "PRN", "PRN-R", "PRN-AD", "PRN-AS", "R", "MU", "NH", "SA", "F", "MISSED"]);
      const validDates = new Set((metadata.dates || []).map((d: string) => d.toLowerCase().trim()));
      const validTimeSlots = new Set((metadata.timeSlots || []).map((t: string) => t.toLowerCase().trim()));
      
      // Helper to normalize date/time for comparison (handles slight AI formatting differences)
      const normalizeForComparison = (str: string): string => str.toLowerCase().trim().replace(/\s+/g, ' ');
      
      // Helper to validate a pass has proper structure AND domain-valid entries
      const validatePassEntries = (entries: any[]): { valid: boolean; validEntries: any[]; invalidCount: number } => {
        const validEntries = entries.filter((e: any) => {
          // Basic structure check
          if (!e.medicationId || !e.date || !e.timeSlot || !e.code) return false;
          if (typeof e.medicationId !== 'number') return false;
          if (typeof e.date !== 'string') return false;
          if (typeof e.timeSlot !== 'string') return false;
          if (typeof e.code !== 'string') return false;

          // Normalize code so legacy outputs like "(NH)" or "PRN R" don't get dropped.
          const normalizedCode = normalizeEmarCode(e.code);
          if (!normalizedCode) return false;
          e.code = normalizedCode;
          
          // Domain constraint checks
          if (!validMedicationIds.has(e.medicationId)) return false;
          if (!validCodes.has(normalizedCode)) return false;
          
          // Date/timeSlot validation with normalization
          const normalizedDate = normalizeForComparison(e.date);
          const normalizedTimeSlot = normalizeForComparison(e.timeSlot);
          if (!validDates.has(normalizedDate)) return false;
          if (!validTimeSlots.has(normalizedTimeSlot)) return false;
          
          return true;
        });
        
        return { 
          valid: validEntries.length === entries.length, 
          validEntries,
          invalidCount: entries.length - validEntries.length
        };
      };
      
      // Helper to check if VALIDATED entries meet quality gates
      // Must be called with already-validated entries to prevent hallucinated data
      const passQualityGates = (validatedEntries: any[]): boolean => {
        // All entries are already validated, so just check counts
        const hasEntries = validatedEntries.length > 0;
        const countOK = agreedCount === 0 || Math.abs(validatedEntries.length - agreedCount) <= Math.max(5, agreedCount * 0.1);
        return hasEntries && countOK;
      };
      
      // If we used grid-parser extraction, skip AI-pass consensus logic.
      // Otherwise, validate all 3 passes and perform per-entry consensus.
      const p1Validation = validatePassEntries(pass1Entries);
      const p2Validation = validatePassEntries(pass2Entries);
      const p3Validation = validatePassEntries(pass3Entries);
      
      console.log(`DEBUG: Valid entries - P1: ${p1Validation.validEntries.length}, P2: ${p2Validation.validEntries.length}, P3: ${p3Validation.validEntries.length}`);
      
      // =====================================================================
      // PER-ENTRY CONSENSUS: Track which passes found each entry
      // With 3 passes: entries in 2+ passes = consensus, otherwise highest count wins
      // =====================================================================
      
      const entryPassVotes = new Map<string, { passIds: Set<number>, entry: any }>();
      
      const allPassValidations = [
        { passNum: 1, entries: p1Validation.validEntries },
        { passNum: 2, entries: p2Validation.validEntries },
        { passNum: 3, entries: p3Validation.validEntries }
      ];
      
      for (const passData of allPassValidations) {
        for (const entry of passData.entries) {
          const hash = hashSingleEntry(entry);
          if (!entryPassVotes.has(hash)) {
            entryPassVotes.set(hash, { passIds: new Set(), entry });
          }
          entryPassVotes.get(hash)!.passIds.add(passData.passNum);
        }
      }
      
      const consensusEntries: any[] = [];
      const singlePassEntries: any[] = [];
      
      entryPassVotes.forEach(({ passIds, entry }) => {
        if (passIds.size >= 2) {
          consensusEntries.push(entry);
        } else {
          singlePassEntries.push(entry);
        }
      });
      
      console.log(`DEBUG: Per-entry consensus - 2+ passes: ${consensusEntries.length}, Single pass: ${singlePassEntries.length}`);
      
      // IMPORTANT: Include ALL single-pass entries (not just refusals) to avoid missing data
      // Highest count pass wins strategy means we include everything
      const refusalCodes = new Set(["R", "MU", "NH", "SA", "PRN-R", "MISSED"]);
      
      if (singlePassEntries.length > 0) {
        console.log(`DEBUG: Including ALL ${singlePassEntries.length} single-pass entries to maximize data capture`);
      }
      
      // Calculate max pass count for logging
      const maxPassCount = Math.max(p1Validation.validEntries.length, p2Validation.validEntries.length, p3Validation.validEntries.length);
      const consensusRatio = maxPassCount > 0 ? consensusEntries.length / maxPassCount : 0;
      
      console.log(`DEBUG: Consensus ratio: ${consensusEntries.length}/${maxPassCount} = ${(consensusRatio * 100).toFixed(1)}%`);
      
      // 3-PASS MERGE with quality gates, then highest count wins
      // 1. Prefer passes that meet quality gates, sorted by count
      // 2. Fall back to highest count if none meet gates
      // 3. Add unique entries from other passes
      // 4. For conflicts: prefer refusal codes over non-refusals
      // 5. Include single-pass entries NOT already in champion to maximize data capture
      const passResults = [
        { pass: 1, entries: p1Validation.validEntries, meetsGates: passQualityGates(p1Validation.validEntries) },
        { pass: 2, entries: p2Validation.validEntries, meetsGates: passQualityGates(p2Validation.validEntries) },
        { pass: 3, entries: p3Validation.validEntries, meetsGates: passQualityGates(p3Validation.validEntries) }
      ];
      
      console.log(`DEBUG: Quality gates - P1: ${passResults[0].meetsGates}, P2: ${passResults[1].meetsGates}, P3: ${passResults[2].meetsGates}`);
      
      if (p1Validation.validEntries.length > 0 || p2Validation.validEntries.length > 0 || p3Validation.validEntries.length > 0) {
        // Prefer passes that meet quality gates, then sort by count
        const gatedPasses = passResults.filter(p => p.meetsGates).sort((a, b) => b.entries.length - a.entries.length);
        const sortedByCount = [...passResults].sort((a, b) => b.entries.length - a.entries.length);
        
        // Champion: highest count among gated passes, or highest count overall if none meet gates
        const championPass = gatedPasses.length > 0 ? gatedPasses[0] : sortedByCount[0];
        const otherPasses = passResults.filter(p => p.pass !== championPass.pass);
        
        console.log(`DEBUG: Champion pass ${championPass.pass} (gates: ${championPass.meetsGates}, count: ${championPass.entries.length})`);
        
        // Create slot-key lookup (medicationId + date + timeSlot)
        const getSlotKey = (e: any) => `${e.medicationId}|${(e.date || '').toLowerCase().trim()}|${(e.timeSlot || '').toLowerCase().trim()}`;
        const isRefusalCode = (code: string) => refusalCodes.has((code || '').toUpperCase());
        
        // Build champion entries map by slot key
        const championBySlot = new Map<string, any>();
        const championSlotKeys = new Set<string>();
        for (const entry of championPass.entries) {
          const key = getSlotKey(entry);
          championBySlot.set(key, entry);
          championSlotKeys.add(key);
        }
        
        // Process all other passes: add unique entries, and for conflicts prefer refusals
        let addedFromOthers = 0;
        let refusalOverrides = 0;
        for (const otherPass of otherPasses) {
          for (const entry of otherPass.entries) {
            const key = getSlotKey(entry);
            const existing = championBySlot.get(key);
            
            if (!existing) {
              // Unique entry - add it
              championBySlot.set(key, entry);
              addedFromOthers++;
            } else if (isRefusalCode(entry.code) && !isRefusalCode(existing.code)) {
              // Conflict: other pass has refusal, champion doesn't - prefer refusal
              championBySlot.set(key, entry);
              refusalOverrides++;
              console.log(`DEBUG: Refusal override at slot ${key}: ${existing.code} -> ${entry.code}`);
            }
            // Otherwise: keep champion entry
          }
        }
        
        // Add single-pass entries that are NOT already in champion (unique contributions only)
        let addedFromSinglePass = 0;
        for (const singleEntry of singlePassEntries) {
          const key = getSlotKey(singleEntry);
          // Skip if this entry was already in the champion pass
          if (championSlotKeys.has(key)) continue;
          
          const existing = championBySlot.get(key);
          if (!existing) {
            championBySlot.set(key, singleEntry);
            addedFromSinglePass++;
          } else if (isRefusalCode(singleEntry.code) && !isRefusalCode(existing.code)) {
            // Single-pass has refusal, existing doesn't - prefer refusal
            championBySlot.set(key, singleEntry);
            refusalOverrides++;
          }
        }
        
        extractedEntries = Array.from(championBySlot.values());
        
        // Determine which passes actually contributed to consensus
        const actualMatchingPasses: number[] = [];
        entryPassVotes.forEach(({ passIds }) => {
          if (passIds.size >= 2) {
            passIds.forEach(pid => {
              if (!actualMatchingPasses.includes(pid)) actualMatchingPasses.push(pid);
            });
          }
        });
        actualMatchingPasses.sort((a, b) => a - b);
        
        const hasConflicts = addedFromOthers > 0 || refusalOverrides > 0 || addedFromSinglePass > 0;
        console.log(`DEBUG: Champion pass ${championPass.pass}: ${championPass.entries.length} base + ${addedFromOthers} from other passes + ${addedFromSinglePass} single-pass + ${refusalOverrides} refusal overrides = ${extractedEntries.length} total`);
        
        // Set status: verified only if high consensus AND no conflicts
        if (consensusRatio >= 0.9 && !hasConflicts) {
          consensusStatus = "verified";
          consensusDetails.matchingPasses = actualMatchingPasses;
          consensusDetails.fallbackPassUsed = championPass.pass;
        } else {
          consensusStatus = "no_consensus";
          consensusDetails.matchingPasses = actualMatchingPasses;
          consensusDetails.fallbackPassUsed = championPass.pass;
          consensusDetails.escalationReason = `Merged pass ${championPass.pass} (${championPass.entries.length}) + ${addedFromOthers} other + ${addedFromSinglePass} single + ${refusalOverrides} refusal overrides = ${extractedEntries.length} total (consensus: ${(consensusRatio * 100).toFixed(0)}%)`;
        }
      } else {
        // All passes returned 0 valid entries
        consensusStatus = "no_consensus";
        consensusDetails.matchingPasses = [];
        extractedEntries = [];
        consensusDetails.fallbackPassUsed = 0;
        consensusDetails.escalationReason = "CRITICAL: All extraction passes failed validation - manual document review required";
        console.log(`DEBUG: CRITICAL - all passes failed validation`);
      }
      }
      sendProgress(65, "Extraction complete...", "extraction_complete");
      
      console.log(`DEBUG: Extraction result: ${consensusStatus}, using ${extractedEntries.length} entries`);

      // =====================================================================
      // GRID FALLBACK: if AI extraction misses too many entries, use grid parser
      // =====================================================================
      if (!gridPrimaryEnabled && gridBaseline && Array.isArray(gridBaseline.cells) && gridBaseline.cells.length > 0) {
        const medIdByKey = new Map<string, number>();
        for (const med of medicationsWithIds) {
          const key = normalizeMedicationKey(med?.name || "");
          if (key) medIdByKey.set(key, med.medicationId);
        }

        const resolveMedicationId = (name: string): number | null => {
          const key = normalizeMedicationKey(name || "");
          if (!key) return null;
          const direct = medIdByKey.get(key);
          if (direct) return direct;
          let bestId: number | null = null;
          let bestScore = 0;
          for (const [candidateKey, id] of medIdByKey.entries()) {
            if (!candidateKey) continue;
            const hit = candidateKey.includes(key) || key.includes(candidateKey);
            if (!hit) continue;
            const score = Math.min(candidateKey.length, key.length);
            if (score > bestScore) {
              bestScore = score;
              bestId = id;
            }
          }
          return bestScore >= 6 ? bestId : null;
        };

        const buildGridEntries = () => {
          const entries: any[] = [];
        for (const cell of gridBaseline.cells) {
          const medId = resolveMedicationId(cell.medication || "");
          if (!medId) continue;
          const code = inferGridCode(cell, medId);
          if (!code || code === "BLANK" || code === "N/A") continue;
          const entry: any = {
            medicationId: medId,
              date: cell.date || "",
              timeSlot: cell.timeSlot || "",
              code,
              careWorkerInitials: cell.careWorker || "",
              time: cell.time || "",
              hasTime: false,
              isOfficeClosed: false
          };
          entry.hasTime = computeHasTime(entry);
            entries.push(entry);
          }
          return deduplicateEntries(entries);
        };

        const gridNonBlankCount = gridBaseline.cells.reduce((count, cell) => {
          const code = normalizeCellCode(cell.code);
          if (code && code !== "BLANK" && code !== "N/A") return count + 1;
          const contentCode = extractCellCode(cell.content);
          if (contentCode && contentCode !== "N/A") return count + 1;
          const hasTime = hasExplicitTimeInCell(cell);
          const hasInitials = Boolean(cell.careWorker && cell.careWorker.trim());
          if (hasTime || hasInitials) return count + 1;
          return count;
        }, 0);

        if (gridNonBlankCount > 0) {
          const aiEntryCount = extractedEntries.length;
          const gridEntries = buildGridEntries();
          const minExpected = Math.max(10, Math.floor(gridNonBlankCount * 0.5));
          if (aiEntryCount < minExpected && gridEntries.length > 0) {
            extractedEntries = gridEntries;
            gridOverrideUsed = true;
            extractionMethod = "grid-parser";
            consensusStatus = "no_consensus";
            consensusDetails.fallbackPassUsed = 0;
            consensusDetails.escalationReason = `Grid parser override: AI extracted ${aiEntryCount} entries vs ${gridEntries.length} grid entries (non-blank cells: ${gridNonBlankCount}).`;
            sendEvent('warning', {
              message: `AI extraction captured ${aiEntryCount} entries; grid parser found ${gridEntries.length}. Using grid parser results.`
            });
          }
        }
      }
      
      // =====================================================================
      // PRN POLICY: PRN without a time = PRN refused (PRN-R).
      // Apply only to medications marked as PRN in the prescription.
      // =====================================================================
      const inferredPrnMedicationIds = new Set<number>();
      const inferredPrnMedicationNames: string[] = [];
      const prnCodeSet = new Set(["PRN", "PRN-AD", "PRN-AS", "PRN-R"]);
      const adminCodeSet = new Set(["AD", "AS", "P"]);
      const medCodeStats = new Map<number, { prn: number; admin: number }>();

      for (const entry of extractedEntries) {
        const medId = Number(entry.medicationId) || 0;
        if (!medId) continue;
        const code = normalizeEmarCode(entry.code || "");
        if (!medCodeStats.has(medId)) medCodeStats.set(medId, { prn: 0, admin: 0 });
        const stats = medCodeStats.get(medId)!;
        if (prnCodeSet.has(code)) stats.prn += 1;
        if (adminCodeSet.has(code)) stats.admin += 1;
      }

      for (const [medId, stats] of medCodeStats.entries()) {
        const inferred =
          stats.prn >= 1 && stats.admin === 0
            ? true
            : stats.prn >= 2 && stats.prn >= stats.admin;
        if (!inferred) continue;
        if (prnMedicationIds.has(medId)) continue;
        inferredPrnMedicationIds.add(medId);
        const medName = medicationsWithIds.find((m: any) => m.medicationId === medId)?.name;
        if (medName) inferredPrnMedicationNames.push(medName);
      }

      let prnRefusalCount = 0;
      let prnAdminRemapCount = 0;
      extractedEntries = extractedEntries.map((entry: any) => {
        const normalizedCode = normalizeEmarCode(entry.code || "");
        const codeLooksPrn = normalizedCode.startsWith("PRN");
        const isPrnMed =
          prnMedicationIds.has(entry.medicationId) ||
          inferredPrnMedicationIds.has(entry.medicationId) ||
          codeLooksPrn;

        // Use computeHasTime for deterministic detection (same logic used in consensus)
        const hasTime = computeHasTime(entry);

        if (!isPrnMed) return entry;

        const code = normalizedCode;
        if (!hasTime) {
          if (code !== "PRN-R") {
            prnRefusalCount++;
            console.log(
              `DEBUG: PRN->PRN-R conversion: medId=${entry.medicationId}, date=${entry.date}, timeSlot=${entry.timeSlot}, hasTime=${hasTime}, time="${entry.time}"`
            );
          }
          return { ...entry, code: "PRN-R", hasTime: false };
        }

        if (code === "AD") {
          prnAdminRemapCount++;
          return { ...entry, code: "PRN-AD" };
        }
        if (code === "AS") {
          prnAdminRemapCount++;
          return { ...entry, code: "PRN-AS" };
        }
        if (code === "P") {
          prnAdminRemapCount++;
          return { ...entry, code: "PRN" };
        }
        if (code === "R") {
          prnRefusalCount++;
          return { ...entry, code: "PRN-R", hasTime: false };
        }
        return entry;
      });

      if (prnRefusalCount > 0) {
        console.log(`DEBUG: Converted ${prnRefusalCount} PRN entries without times to PRN-R (refused)`);
      }
      if (prnAdminRemapCount > 0) {
        console.log(`DEBUG: Remapped ${prnAdminRemapCount} PRN entries from AD/AS/P to PRN codes`);
      }
      
      // =====================================================================
      // SANITY CHECK: Compare actual extracted entries per medication vs expected
      // =====================================================================
      const actualEntriesPerMedication = new Map<number, number>();
      for (const entry of extractedEntries) {
        const medId = Number(entry.medicationId) || 0;
        actualEntriesPerMedication.set(medId, (actualEntriesPerMedication.get(medId) || 0) + 1);
      }
      
      console.log(`DEBUG: ===== PER-MEDICATION SANITY CHECK =====`);
      let totalDiscrepancyCount = 0;
      for (const [medId, expectedCount] of Array.from(expectedEntriesPerMedication.entries())) {
        const actualCount = actualEntriesPerMedication.get(medId) || 0;
        const medication = medicationsWithIds.find((m: any) => m.medicationId === medId);
        const medName = medication?.name || `Unknown (ID:${medId})`;
        
        if (actualCount !== expectedCount) {
          console.warn(`DEBUG: DISCREPANCY [ID:${medId}] ${medName}: expected ${expectedCount}, got ${actualCount} (diff: ${actualCount - expectedCount})`);
          totalDiscrepancyCount++;
        } else {
          console.log(`DEBUG: OK [ID:${medId}] ${medName}: ${actualCount} entries (matches expected)`);
        }
      }
      
      if (totalDiscrepancyCount > 0) {
        console.warn(`DEBUG: Total per-medication discrepancies: ${totalDiscrepancyCount}/${expectedEntriesPerMedication.size} medications`);
      } else {
        console.log(`DEBUG: All ${expectedEntriesPerMedication.size} medications match expected entry counts`);
      }
      console.log(`DEBUG: =========================================`);
      
      sendProgress(70, "Processing results...", "processing");
      
      let extractedCount = 0;
      let countValidationMatch = false;

      // =====================================================================
      // COUNT VALIDATION - Compare extracted count to agreedCount for transparency
      // =====================================================================
      extractedCount = extractedEntries.length;
      if ((gridPrimaryEnabled || gridOverrideUsed) && gridNonBlankCount > 0) {
        agreedCount = gridNonBlankCount;
      }
      
      if (agreedCount === 0) {
        // No agreed count available - no baseline to validate against
        countValidationMatch = false;
        console.log("DEBUG: Count validation FAILED - no agreed count available (agreedCount=0)");
      } else if (extractedCount === agreedCount) {
        countValidationMatch = true;
        console.log(`DEBUG: Count validation PASSED - extracted ${extractedCount} matches expected ${agreedCount}`);
      } else {
        countValidationMatch = false;
        console.log(`DEBUG: Count validation FAILED - extracted ${extractedCount} vs expected ${agreedCount}`);
      }

      // Combine metadata with entries (using medications with IDs)
      const extractedData = {
        serviceUserInitials: metadata.serviceUserInitials,
        allergies: metadata.allergies,
        medications: medicationsWithIds,
        entries: extractedEntries,
        dates: metadata.dates,
        timeSlots: metadata.timeSlots
      };
      
      // Build a map of medicationId -> medication details for quick lookup
      const medIdToDetails = new Map<number, any>();
      medicationsWithIds.forEach((m: any) => {
        medIdToDetails.set(m.medicationId, m);
      });
      const medNameToId = new Map<string, number>();
      medicationsWithIds.forEach((m: any) => {
        const key = normalizeMedicationKey(m?.name || "");
        if (!key) return;
        if (!medNameToId.has(key)) medNameToId.set(key, m.medicationId);
      });

      const resolveMedicationIdFromName = (name: string): number | null => {
        const key = normalizeMedicationKey(name || "");
        if (!key) return null;
        const direct = medNameToId.get(key);
        if (direct) return direct;
        let bestId: number | null = null;
        let bestScore = 0;
        for (const [candidateKey, id] of medNameToId.entries()) {
          if (!candidateKey) continue;
          const hit = candidateKey.includes(key) || key.includes(candidateKey);
          if (!hit) continue;
          const score = Math.min(candidateKey.length, key.length);
          if (score > bestScore) {
            bestScore = score;
            bestId = id;
          }
        }
        return bestScore >= 6 ? bestId : null;
      };

      const normalizeInitialsToken = (value: unknown): string =>
        String(value || "").toUpperCase().replace(/[^A-Z]/g, "");

      // Calculate expected total cells (for non-PRN medications)
      const nonPrnMedsList = metadata.medications?.filter((m: any) => !m.isPRN) || [];
      const prnMedsList = metadata.medications?.filter((m: any) => m.isPRN) || [];
      const expectedNonPrnEntries = nonPrnMedsList.length * (metadata.dates?.length || 0) * (metadata.timeSlots?.length || 0);
      const actualEntriesCount = extractedEntries.length;
      const expectedEntriesCount = (gridPrimaryEnabled || gridOverrideUsed) && gridNonBlankCount > 0
        ? gridNonBlankCount
        : expectedNonPrnEntries;
      
      console.log(`DEBUG: Grid structure - ${metadata.medications?.length || 0} meds (${nonPrnMedsList.length} regular, ${prnMedsList.length} PRN), ${metadata.dates?.length || 0} dates, ${metadata.timeSlots?.length || 0} timeSlots`);
      console.log(`DEBUG: Expected non-PRN entries: ${expectedNonPrnEntries}, Actual entries extracted: ${extractedEntries.length}`);

      // Fetch care workers from database to match initials to full names
      const dbCareWorkers = await storage.getAllCareWorkers();
      
      // Build a map of initials -> full name
      const initialsToName = new Map<string, string>();
      dbCareWorkers.forEach((cw: { name: string }) => {
        // Generate initials from name (e.g., "Sarah Johnson" -> "SJ")
        const nameParts = cw.name.split(/[\s.]+/).filter((p: string) => p.length > 0);
        const initials = nameParts.map((p: string) => p[0].toUpperCase()).join("");
        initialsToName.set(initials, cw.name);
        
        // Also match single-character abbreviations (e.g., "S. Johnson" has initials "S" and "J")
        if (nameParts.length >= 2) {
          const twoLetterInitials = nameParts[0][0].toUpperCase() + nameParts[nameParts.length - 1][0].toUpperCase();
          initialsToName.set(twoLetterInitials, cw.name);
        }
      });
      
      console.log("DEBUG: Care worker initials map:", Object.fromEntries(initialsToName));

      // Track unknown initials that don't match any database care worker
      const unknownInitials = new Set<string>();

      // Map AI-extracted entries to the format expected by validation logic
      // Replace initials with full names where possible, track unknown ones
      // Use medicationId to resolve medication name deterministically
      let allEntries = (extractedData.entries || []).map((entry: any) => {
        const rawCareWorker = String(entry.careWorker || "").trim();
        const rawInitials = normalizeInitialsToken(entry.careWorkerInitials || rawCareWorker);
        const initials = rawInitials === "MANUAL" ? "" : rawInitials;
        const looksLikeName = rawCareWorker.split(/\s+/).filter(Boolean).length >= 2;
        let careWorkerValue = rawCareWorker;

        if (looksLikeName && rawCareWorker) {
          careWorkerValue = rawCareWorker;
        } else if (initials && initials.length > 0) {
          const fullName = initialsToName.get(initials);
          if (fullName) {
            careWorkerValue = fullName;
          } else {
            // Keep original initials but track as unknown
            careWorkerValue = rawCareWorker || initials;
            unknownInitials.add(initials);
          }
        } else if (rawCareWorker) {
          careWorkerValue = rawCareWorker;
        } else {
          careWorkerValue = "Not recorded";
        }

        // Resolve medication name from medicationId or fallback to name matching
        const rawMedicationName = typeof entry.medication === "string" ? entry.medication.trim() : "";
        let medId = Number(entry.medicationId) || 0;
        if (!medId || !medIdToDetails.has(medId)) {
          const resolvedId = rawMedicationName ? resolveMedicationIdFromName(rawMedicationName) : null;
          if (resolvedId) medId = resolvedId;
        }
        const medDetails = medIdToDetails.get(medId);
        const medicationName =
          medDetails?.name ||
          rawMedicationName ||
          (medId > 0 ? `Medication ${medId}` : "Unmatched medication");

        return {
          medicationId: medId,
          medication: medicationName,
          date: entry.date || "",
          timeSlot: entry.timeSlot || "",
          time: entry.time || "",
          code: entry.code || "BLANK",
          careWorker: careWorkerValue,
          careWorkerInitials: initials,
          hasTime: typeof entry.hasTime === "boolean" ? entry.hasTime : computeHasTime(entry),
          isOfficeClosed: false
        };
      });
      
      // Log any unknown initials found
      if (unknownInitials.size > 0) {
        console.log("DEBUG: Unknown care worker initials (not in database):", Array.from(unknownInitials));
      }
      
      const allDates = extractedData.dates || [];
      const timeSlots = extractedData.timeSlots || [];
      let medications = extractedData.medications || [];
      const allergies = extractedData.allergies || "";
      
      // =====================================================================
      // MEDICATION DEDUPLICATION
      // The 3-pass extraction system can extract the same medication multiple
      // times (once per pass), each with a different medicationId. This step
      // deduplicates medications by normalized name to prevent inflated counts.
      // =====================================================================
      
      // Helper to normalize medication names for comparison.
      // IMPORTANT: Include strength/form signals so two meds with the same base name
      // (e.g., tablet vs liquid) are not merged.
      const normalizeMedName = (med: any): string => {
        const rawName = String(med?.name || "");
        const rawInstructions = String(med?.instructions || "");
        const base = normalizeMedicationKey(rawName || "")
          .replace(/\b(tablets?|tabs?|capsules?|caps?)\b/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const gridMedicationId = Number(med?.gridMedicationId) || 0;
        const gridKey = gridMedicationId > 0 ? `grid:${gridMedicationId}` : "";

        const combined = `${rawName} ${rawInstructions}`.toLowerCase();
        const signature = new Set<string>();

        const ratioMatches =
          combined.match(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)\b/g) || [];
        for (const match of ratioMatches) signature.add(normalizeMedicationKey(match));

        const strengthMatches =
          combined.match(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%)\b/g) || [];
        for (const match of strengthMatches) signature.add(normalizeMedicationKey(match));

        const formMatches =
          combined.match(/\b(tablets?|tabs?|capsules?|caps?|liquid|solution|syrup|suspension|cream|ointment|gel|patch(?:es)?|spray|drops?|inhaler|injection|ampoules?|nebules?|puffs?)\b/g) ||
          [];
        for (const match of formMatches) signature.add(normalizeMedicationKey(match));

        const routeMatches =
          combined.match(/\b(oral|topical|subcutaneous|intravenous|iv|im|pr|sc)\b/g) || [];
        for (const match of routeMatches) signature.add(normalizeMedicationKey(match));

        const signatureKey = Array.from(signature).filter(Boolean).sort().join("-");
        if (signatureKey) return `${base}|${gridKey ? `${gridKey}|` : ""}${signatureKey}`;

        const instrKey = normalizeMedicationKey(rawInstructions).split(" ").slice(0, 10).join(" ");
        if (instrKey) return `${base}|${gridKey ? `${gridKey}|` : ""}instr:${instrKey}`;
        return gridKey ? `${base}|${gridKey}` : base;
      };
      
      // Group medications by normalized name, keeping first occurrence as canonical
      const medByNormalizedName = new Map<string, any>();
      const oldIdToCanonicalId = new Map<number, number>();
      
      medications.forEach((med: any) => {
        const normalizedName = normalizeMedName(med);
        
        if (!medByNormalizedName.has(normalizedName)) {
          // First occurrence - this becomes the canonical entry
          medByNormalizedName.set(normalizedName, med);
          oldIdToCanonicalId.set(med.medicationId, med.medicationId);
        } else {
          // Duplicate - map old ID to canonical ID
          const canonicalMed = medByNormalizedName.get(normalizedName);
          oldIdToCanonicalId.set(med.medicationId, canonicalMed.medicationId);

          // Merge critical fields so we don't lose PRN flags or richer metadata when deduping
          const merged = { ...canonicalMed };
          merged.isPRN = Boolean(canonicalMed.isPRN || med.isPRN);

          const canonicalInstr = (canonicalMed?.instructions || "").toString();
          const newInstr = (med?.instructions || "").toString();
          if (newInstr.length > canonicalInstr.length) {
            merged.instructions = med.instructions;
          }

          if (merged.requiredGapHours == null && med.requiredGapHours != null) {
            merged.requiredGapHours = med.requiredGapHours;
          }

          const canonicalScheduled = Array.isArray(canonicalMed?.scheduledTimeSlots) ? canonicalMed.scheduledTimeSlots : [];
          const newScheduled = Array.isArray(med?.scheduledTimeSlots) ? med.scheduledTimeSlots : [];
          if (newScheduled.length > canonicalScheduled.length) {
            merged.scheduledTimeSlots = newScheduled;
          }

          const canonicalTimeSlots = Array.isArray(canonicalMed?.timeSlots) ? canonicalMed.timeSlots : [];
          const newTimeSlots = Array.isArray(med?.timeSlots) ? med.timeSlots : [];
          if (newTimeSlots.length > canonicalTimeSlots.length) {
            merged.timeSlots = newTimeSlots;
          }

          // Preserve the original canonical medicationId for stability
          merged.medicationId = canonicalMed.medicationId;
          medByNormalizedName.set(normalizedName, merged);
        }
      });
      
      // Get deduplicated medications array
      const originalMedCount = medications.length;
      medications = Array.from(medByNormalizedName.values());
      const deduplicatedMedCount = medications.length;
      
      // Log deduplication results
      if (originalMedCount !== deduplicatedMedCount) {
        console.log(`DEBUG: Medication deduplication - reduced from ${originalMedCount} to ${deduplicatedMedCount} unique medications`);
        console.log("DEBUG: ID remapping:", Object.fromEntries(oldIdToCanonicalId));
      }
      
      // Update allEntries to use canonical medication IDs
      allEntries.forEach((entry: any) => {
        const canonicalId = oldIdToCanonicalId.get(entry.medicationId);
        if (canonicalId !== undefined && canonicalId !== entry.medicationId) {
          entry.medicationId = canonicalId;
          // Also update medication name from canonical entry
          const canonicalMed = Array.from(medByNormalizedName.values()).find((m: any) => m.medicationId === canonicalId);
          if (canonicalMed) {
            entry.medication = canonicalMed.name;
          }
        }
      });
      
      // Update the medIdToDetails map with deduplicated medications
      medIdToDetails.clear();
      medications.forEach((med: any) => {
        medIdToDetails.set(med.medicationId, {
          name: med.name,
          strength: med.strength || "",
          form: med.form || "",
          isPRN: med.isPRN || false,
        });
      });

      const preEntryDedupCount = allEntries.length;
      allEntries = deduplicateEntries(allEntries);
      if (allEntries.length !== preEntryDedupCount) {
        console.log(
          `DEBUG: Entry deduplication - reduced from ${preEntryDedupCount} to ${allEntries.length} unique slot entries`
        );
      }

      const canonicalPrnMedicationIds = new Set<number>();
      for (const id of prnMedicationIds) {
        const canonical = oldIdToCanonicalId.get(id) ?? id;
        canonicalPrnMedicationIds.add(canonical);
      }
      const canonicalInferredPrnMedicationIds = new Set<number>();
      for (const id of inferredPrnMedicationIds) {
        const canonical = oldIdToCanonicalId.get(id) ?? id;
        canonicalInferredPrnMedicationIds.add(canonical);
      }
      
      console.log("DEBUG: Extracted", allEntries.length, "entries,", allDates.length, "dates,", timeSlots.length, "time slots,", medications.length, "unique medications");
      sendProgress(75, "Detecting discrepancies...", "discrepancy_detection");

      // =====================================================================
      // DETERMINISTIC VALIDATION - ALL CHECKS DONE IN CODE
      // =====================================================================

      interface Discrepancy {
        careWorkerName: string;
        date: string;
        timeSlot: string;
        medication: string;
        medicationId?: number;
        code?: string; // Administration code (R, MU, NH, etc.) - used for refusal grouping
        issue: string;
        severity: "high" | "medium" | "low";
        actions: { performanceNote: boolean; meeting: string; referToManager: boolean };
      }

      interface VerificationItem {
        careWorkerName: string;
        date: string;
        medication: string;
        medicationId?: number;
        code: string;
        note: string;
        timeSlot?: string;
      }

      interface Warning {
        type: string;
        severity: "critical" | "high" | "medium" | "low";
        medication: string;
        medicationId?: number;
        description: string;
        recommendedAction: string;
      }

      const discrepancies: Discrepancy[] = [];
      const verificationItems: VerificationItem[] = [];
      const warnings: Warning[] = [];

      if (inferredPrnMedicationNames.length > 0) {
        warnings.push({
          type: "prn_inferred_from_codes",
          severity: "low",
          medication: inferredPrnMedicationNames.join(", "),
          description: "PRN status inferred from chart codes because prescription text did not explicitly confirm PRN.",
          recommendedAction: "Verify the prescription instructions confirm PRN status."
        });
      }
      
      // =====================================================================
      // PRN VALIDATION HELPER - Only prescription text determines PRN status
      // =====================================================================
      // User-specified keywords: "as required", "as needed", "when required", "PRN", "take up to"
      const PRN_KEYWORDS = [
        'as required', 'as needed', 'when required', 'when needed',
        'take up to', 'if needed', 'if required', 'when necessary'
      ];
      
      const isPRNFromInstructions = (med: { name?: string; instructions?: string }): boolean => {
        const combined = `${med?.name || ""} ${med?.instructions || ""}`.trim();
        if (!combined) return false;
        const lower = combined.toLowerCase();
        // Check for exact PRN keyword (word boundary to avoid matching in other words)
        if (/\bprn\b/i.test(combined)) return true;
        // Check for phrase keywords
        if (PRN_KEYWORDS.some(keyword => lower.includes(keyword))) return true;
        // Check for "up to X times" or "up to X tablets" pattern (PRN indicator)
        // But NOT "up to Xmg" or "up to X mg" (dosage adjustment, not PRN)
        if (/up to \d+\s*(times|tablets?|capsules?|doses?|daily|a day)/i.test(combined)) return true;
        return false;
      };
      
      // Build lookup maps
      const prnMedIds = new Set<number>(); // Track PRN medication IDs
      const medNameById = new Map<number, string>();
      const medGapHoursById = new Map<number, number>();
      const medScheduledSlotCountById = new Map<number, number>(); // Track how many scheduled slots per medication
      
      medications.forEach((med: any) => {
        const medId = Number(med?.medicationId) || 0;
        if (medId) medNameById.set(medId, med.name);

        // VALIDATE PRN: Only mark as PRN if instructions contain PRN keywords
        const validatedIsPRN = isPRNFromInstructions(med);
        const gridStats = getGridPrnStatsForMed(med.name, Number(med?.gridMedicationId) || 0);
        const nonBlankCount = gridStats?.nonBlankCount || 0;
        const prnCount = gridStats?.prnCount || 0;
        const prnRatio = nonBlankCount > 0 ? prnCount / nonBlankCount : 0;
        const gridPrnStrong = Boolean(gridStats && prnCount >= 2 && prnRatio >= 0.5);
        const hasInstructionText = Boolean((med?.instructions || "").toString().trim());
        const finalIsPRN = validatedIsPRN || gridPrnStrong || (med.isPRN && !validatedIsPRN && !gridPrnStrong && !hasInstructionText);
        
        // Override AI's isPRN with validated value from prescription text
        if (med.isPRN !== finalIsPRN) {
          console.log(`DEBUG: PRN validation override for "${med.name}": AI said isPRN=${med.isPRN}, instructions say isPRN=${validatedIsPRN}, gridHint=${gridPrnStrong}`);
          med.isPRN = finalIsPRN;
        }
        
        if (med.isPRN) {
          if (medId) prnMedIds.add(medId);
        }

        if (medId) {
          const rawGap = Number(med?.requiredGapHours);
          const inferredGap = inferRequiredGapHoursFromText(`${med?.name || ""} ${med?.instructions || ""}`);
          const normalizedRaw =
            Number.isFinite(rawGap) && rawGap >= 1 && rawGap <= 24 ? rawGap : null;
          const gapHours =
            typeof inferredGap === "number" && Number.isFinite(inferredGap) && (normalizedRaw == null || normalizedRaw === 4)
              ? inferredGap
              : normalizedRaw ?? 4;
          medGapHoursById.set(medId, gapHours);
        }

        // Track scheduled time slot count for time gap validation
        // Prefer per-medication slots, only default to 1 if not specified (assume once-daily)
        const slotCount = med.scheduledTimeSlots?.length || med.timeSlots?.length || 1;
        if (medId) medScheduledSlotCountById.set(medId, slotCount);
      });

      // =====================================================================
      // CHECK 1: ALLERGY MATCHING
      // =====================================================================
      const allergyLower = allergies.toLowerCase();
      const noKnownAllergies = [
        "no known",
        "none known",
        "no allergies",
        "nkda",
        "nka",
        "none"
      ].some((phrase) => allergyLower.includes(phrase));
      if (!noKnownAllergies && allergies.trim() !== "") {
        // Parse allergies - split by comma, semicolon, or "and"
        const allergyList = allergies.split(/[,;]|\band\b/i).map(a => a.trim().toLowerCase()).filter(a => a.length > 2);
        
        medications.forEach((med: any) => {
          const medLower = med.name.toLowerCase();
          const genericLower = (med.genericName || "").toLowerCase();
          
          allergyList.forEach(allergy => {
            if (medLower.includes(allergy) || genericLower.includes(allergy) || allergy.includes(genericLower)) {
              warnings.push({
                type: "allergy_match",
                severity: "critical",
                medication: med.name,
                description: `CRITICAL: Medication "${med.name}" may contain "${allergy}" which is listed as an allergy`,
                recommendedAction: "URGENT: Verify with prescriber immediately. Do not administer until confirmed safe."
              });
            }
          });
        });
      }

      // =====================================================================
      // CHECK 2: DUPLICATE MEDICATIONS (Same Generic Name)
      // =====================================================================
      const genericToMeds = new Map<string, string[]>();
      medications.forEach((med: any) => {
        const generic = (med.genericName || "").toLowerCase();
        if (generic) {
          if (!genericToMeds.has(generic)) genericToMeds.set(generic, []);
          genericToMeds.get(generic)!.push(med.name);
        }
      });

      genericToMeds.forEach((meds, generic) => {
        if (meds.length > 1) {
          warnings.push({
            type: "duplicate_active_ingredient",
            severity: "critical",
            medication: meds.join(", "),
            description: `CRITICAL: Multiple medications contain same active ingredient "${generic}": ${meds.join(", ")}. Risk of overdose.`,
            recommendedAction: "URGENT: Review with prescriber. May be intentional (different release forms) or error."
          });
        }
      });

      // =====================================================================
      // CHECK 3: DUPLICATE MEDICATION ENTRIES (Same Med Listed Twice)
      // =====================================================================
      const medNameCounts = new Map<string, number>();
      medications.forEach((med: any) => {
        const baseName = med.name.split(/\d/)[0].trim().toLowerCase();
        medNameCounts.set(baseName, (medNameCounts.get(baseName) || 0) + 1);
      });

      medNameCounts.forEach((count, baseName) => {
        if (count > 1) {
          const matchingMeds = medications.filter((m: any) => 
            m.name.toLowerCase().startsWith(baseName)
          ).map((m: any) => m.name);
          
        const hasDoseOrRoute = (med: any): boolean => {
          const text = `${med?.name || ""} ${med?.instructions || ""}`.toLowerCase();
          const strength = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%|micrograms?|milligrams?|grams?|millilitres?)\b/i.test(text);
          const form = /\b(tablets?|tabs?|capsules?|caps?|liquid|solution|syrup|suspension|cream|ointment|gel|patch(?:es)?|spray|drops?|inhaler|injection|ampoules?|nebules?|puffs?)\b/i.test(text);
          const route = /\b(oral|topical|subcutaneous|intravenous|iv|im|pr|sc)\b/i.test(text);
          return strength || form || route;
        };

        const medEntries = medications.filter((m: any) => m.name.toLowerCase().startsWith(baseName));
        const anyDifferentiator = medEntries.some((med: any) => hasDoseOrRoute(med));
        const variantKeys = new Set(
          medEntries.map((med: any) => {
            const text = `${med?.name || ""} ${med?.instructions || ""}`.toLowerCase();
            const strength = (text.match(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%|micrograms?|milligrams?|grams?|millilitres?)\b/g) || []).sort().join("-");
            const form = (text.match(/\b(tablets?|tabs?|capsules?|caps?|liquid|solution|syrup|suspension|cream|ointment|gel|patch(?:es)?|spray|drops?|inhaler|injection|ampoules?|nebules?|puffs?)\b/g) || []).sort().join("-");
            const route = (text.match(/\b(oral|topical|subcutaneous|intravenous|iv|im|pr|sc)\b/g) || []).sort().join("-");
            const parts = [strength, form, route].filter(Boolean);
            return parts.join("|");
          }).filter((key: string) => key.length > 0)
        );

        if (!anyDifferentiator || variantKeys.size <= 1) {
          warnings.push({
            type: "duplicate_medication_entry",
            severity: "high",
            medication: matchingMeds.join(", "),
            description: `Medication "${baseName}" appears ${count} times without clear dose/route/form differences in the notes.`,
            recommendedAction: "Confirm if duplicates are intentional; add dose/route/form details or remove duplicates."
          });
        }

        if (!anyDifferentiator || variantKeys.size <= 1) {
          const medEntries = medications.filter((m: any) =>
            m.name.toLowerCase().startsWith(baseName)
          );
          const administeredByMedId = new Set<number>();
          for (const entry of allEntries) {
            const code = String(entry.code || "").toUpperCase();
            if (!["AD", "PRN-AD", "PRN", "ADMINISTERED", "GIVEN", "A"].includes(code)) continue;
            const medId = Number(entry.medicationId) || 0;
            if (!medId) continue;
            const belongs = medEntries.some((m: any) => Number(m.medicationId) === medId);
            if (belongs) administeredByMedId.add(medId);
          }
          if (administeredByMedId.size >= 2) {
            warnings.push({
              type: "duplicate_medication_administered",
              severity: "high",
              medication: medEntries.map((m: any) => m.name).join(", "),
              description: `Multiple entries for "${baseName}" were administered without clear dose/route/form differences in the notes.`,
              recommendedAction: "Confirm both administrations are valid or clarify dosage/route/form in the medication notes."
            });
          }
        }
      }
      });

      // =====================================================================
      // CHECK 3A: DUPLICATE MEDICATIONS WITH EXACT SAME DOSE
      // =====================================================================
      const buildExactDoseKey = (med: any): { key: string; hasStrength: boolean } => {
        const name = String(med?.name || "");
        const instructions = String(med?.instructions || "");
        const extra = `${med?.strength || ""} ${med?.form || ""}`;
        const combined = `${name} ${instructions} ${extra}`.toLowerCase();

        const base = normalizeMedicationKey(name)
          .replace(/\b(tablets?|tabs?|capsules?|caps?)\b/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const signature = new Set<string>();
        const strengthMatches =
          combined.match(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%|micrograms?|milligrams?|grams?|millilitres?)\b/g) || [];
        for (const match of strengthMatches) signature.add(normalizeMedicationKey(match));

        const formMatches =
          combined.match(/\b(tablets?|tabs?|capsules?|caps?|liquid|solution|syrup|suspension|cream|ointment|gel|patch(?:es)?|spray|drops?|inhaler|injection|ampoules?|nebules?|puffs?)\b/g) ||
          [];
        for (const match of formMatches) signature.add(normalizeMedicationKey(match));

        const routeMatches =
          combined.match(/\b(oral|topical|subcutaneous|intravenous|iv|im|pr|sc)\b/g) || [];
        for (const match of routeMatches) signature.add(normalizeMedicationKey(match));

        const signatureKey = Array.from(signature).filter(Boolean).sort().join("-");
        return { key: signatureKey ? `${base}|${signatureKey}` : base, hasStrength: strengthMatches.length > 0 };
      };

      const exactDoseMap = new Map<string, { meds: any[]; hasStrength: boolean }>();
      medications.forEach((med: any) => {
        const { key, hasStrength } = buildExactDoseKey(med);
        if (!key) return;
        if (!exactDoseMap.has(key)) {
          exactDoseMap.set(key, { meds: [med], hasStrength });
        } else {
          const existing = exactDoseMap.get(key)!;
          existing.meds.push(med);
          existing.hasStrength = existing.hasStrength || hasStrength;
        }
      });

      exactDoseMap.forEach(({ meds, hasStrength }, key) => {
        if (meds.length < 2) return;
        if (!hasStrength) return;
        const medNames = meds.map((m) => m.name);
        warnings.push({
          type: "duplicate_medication_exact_dose",
          severity: "high",
          medication: medNames.join(", "),
          description: `Exact duplicate medication with the same dose appears multiple times (${meds.length} entries).`,
          recommendedAction: "Confirm whether duplicate entries are intentional; remove duplicates if not."
        });
      });

      // =====================================================================
      // CHECK 3B: PARACETAMOL OVERLAP (e.g., co-codamol + paracetamol)
      // =====================================================================
      const medicationContains = (med: any, pattern: RegExp): boolean => {
        const text = `${med?.name || ""} ${med?.genericName || ""} ${med?.instructions || ""}`.toLowerCase();
        return pattern.test(text);
      };

      const hasParacetamol = (med: any) => medicationContains(med, /\b(paracetamol|acetaminophen)\b/i);
      const isParacetamolCombo = (med: any) =>
        medicationContains(med, /\bco[-\s]?codamol\b/i) ||
        medicationContains(med, /\bco[-\s]?dydramol\b/i) ||
        medicationContains(med, /\bco[-\s]?proxamol\b/i) ||
        medicationContains(med, /\bco[-\s]?codaprin\b/i) ||
        medicationContains(med, /\btramacet\b/i) ||
        (hasParacetamol(med) && medicationContains(med, /\b(codeine|dihydrocodeine|tramadol|aspirin)\b/i));

      const paracetamolOnlyMeds = medications.filter((med: any) => hasParacetamol(med) && !isParacetamolCombo(med));
      const paracetamolComboMeds = medications.filter((med: any) => isParacetamolCombo(med));

      if (paracetamolOnlyMeds.length > 0 && paracetamolComboMeds.length > 0) {
        const medNames = [
          ...new Set([
            ...paracetamolOnlyMeds.map((m: any) => m.name),
            ...paracetamolComboMeds.map((m: any) => m.name),
          ]),
        ];
        warnings.push({
          type: "paracetamol_overlap",
          severity: "high",
          medication: medNames.join(", "),
          description: "Paracetamol appears both as a standalone medication and inside a combination product (e.g., co-codamol). Risk of exceeding max daily dose.",
          recommendedAction: "Review total paracetamol daily dose across all medications."
        });
      }

      // =====================================================================
      // CHECK 3C: DRUG INTERACTIONS (RULE-BASED)
      // =====================================================================
      const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const normalizeMedText = (med: any) =>
        `${med?.name || ""} ${med?.genericName || ""} ${med?.instructions || ""}`
          .toLowerCase()
          .replace(/[^\w]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const hasToken = (text: string, token: string) => new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(text);
      const hasAnyToken = (text: string, tokens: string[]) => tokens.some((token) => hasToken(text, token));
      const filterMeds = (tokens: string[]) =>
        medications.filter((med: any) => hasAnyToken(normalizeMedText(med), tokens));

      const ACE_INHIBITORS = [
        "lisinopril", "ramipril", "enalapril", "perindopril", "captopril", "quinapril",
        "benazepril", "fosinopril", "trandolapril"
      ];
      const ARBS = [
        "losartan", "candesartan", "valsartan", "irbesartan", "olmesartan", "telmisartan", "eprosartan"
      ];
      const NSAIDS = [
        "ibuprofen", "naproxen", "diclofenac", "indomethacin", "ketoprofen", "piroxicam",
        "celecoxib", "etoricoxib", "meloxicam", "ketorolac", "aspirin"
      ];
      const OPIOIDS = [
        "oxycodone", "morphine", "hydromorphone", "hydrocodone", "codeine",
        "dihydrocodeine", "tramadol", "fentanyl", "buprenorphine", "methadone", "tapentadol"
      ];
      const BENZOS = [
        "diazepam", "lorazepam", "temazepam", "oxazepam", "chlordiazepoxide",
        "clonazepam", "alprazolam", "nitrazepam", "midazolam"
      ];
      const SEDATIVES = ["zolpidem", "zopiclone", "eszopiclone", "pregabalin", "gabapentin"];
      const STATINS = ["atorvastatin", "simvastatin", "lovastatin"];
      const CYP3A4_INHIBITORS = [
        "clarithromycin", "erythromycin", "ketoconazole", "itraconazole",
        "voriconazole", "posaconazole", "ritonavir", "cobicistat"
      ];

      const aceOrArbMeds = [...filterMeds(ACE_INHIBITORS), ...filterMeds(ARBS)];
      const nsaidMeds = filterMeds(NSAIDS);
      const opioidMeds = filterMeds(OPIOIDS);
      const benzoMeds = filterMeds(BENZOS);
      const sedativeMeds = filterMeds(SEDATIVES);
      const statinMeds = filterMeds(STATINS);
      const inhibitorMeds = filterMeds(CYP3A4_INHIBITORS);
      const warfarinMeds = filterMeds(["warfarin"]);

      if (aceOrArbMeds.length > 0 && nsaidMeds.length > 0) {
        const medsList = [...new Set([...aceOrArbMeds, ...nsaidMeds].map((m: any) => m.name))];
        warnings.push({
          type: "interaction_ace_arb_nsaid",
          severity: "high",
          medication: medsList.join(", "),
          description: "NSAIDs can reduce the effect of ACE inhibitors/ARBs and may increase kidney-related risks.",
          recommendedAction: "Review need for NSAID therapy, especially in older adults or dehydration; monitor BP/renal function if combined."
        });
      }

      if (opioidMeds.length > 0 && (benzoMeds.length > 0 || sedativeMeds.length > 0)) {
        const medsList = [...new Set([...opioidMeds, ...benzoMeds, ...sedativeMeds].map((m: any) => m.name))];
        warnings.push({
          type: "interaction_opioid_sedative",
          severity: "critical",
          medication: medsList.join(", "),
          description: "Opioids combined with benzodiazepines or other sedatives can cause severe respiratory depression.",
          recommendedAction: "Avoid combination where possible; if necessary, use lowest effective doses and monitor closely."
        });
      }

      if (statinMeds.length > 0 && inhibitorMeds.length > 0) {
        const medsList = [...new Set([...statinMeds, ...inhibitorMeds].map((m: any) => m.name))];
        warnings.push({
          type: "interaction_statin_cyp3a4_inhibitor",
          severity: "high",
          medication: medsList.join(", "),
          description: "Strong CYP3A4 inhibitors (e.g., clarithromycin/azole antifungals) can increase statin levels and myopathy risk.",
          recommendedAction: "Consider holding or adjusting statin during inhibitor therapy; monitor for muscle symptoms."
        });
      }

      if (warfarinMeds.length > 0 && nsaidMeds.length > 0) {
        const medsList = [...new Set([...warfarinMeds, ...nsaidMeds].map((m: any) => m.name))];
        warnings.push({
          type: "interaction_warfarin_nsaid",
          severity: "high",
          medication: medsList.join(", "),
          description: "Warfarin combined with NSAIDs increases bleeding risk.",
          recommendedAction: "Avoid NSAIDs with warfarin where possible; use alternatives and monitor bleeding risk."
        });
      }

      // =====================================================================
      // CHECK 3.5: AI-POWERED MEDICATION EQUIVALENCE DETECTION
      // Uses GPT to identify brand/generic name equivalences that weren't caught
      // Example: Oxycodone and Oxypro MR are the same medication
      // =====================================================================
      if (!gridPrimaryEnabled && medications.length >= 2) {
        sendProgress(52, "Checking for medication equivalences...", "medication_equivalence_check");
        
        const medNames = medications.map((m: any) => m.name).join(", ");
        
        try {
          const equivalencePrompt = "Identify any medication equivalences from the list provided.";
          // Use GPT-4o-mini for equivalence detection - 33x cheaper
          const equivalenceResponse = await executeSecureTextCompletion({
            endpoint: "/api/ai/analyze-emar",
            feature: "emar_equivalence",
            model: emarValidationModel,
            userContext: aiUserContext,
            inputText: equivalencePrompt,
            systemPrompt: `You are a UK pharmaceutical expert. Analyze this list of medications from an EMAR and identify any pairs that are the SAME medication under different names (brand vs generic, or different brand names for the same drug).

MEDICATIONS: ${medNames}

IMPORTANT RULES:
1. Only flag TRUE EQUIVALENCES - where medications contain the SAME active ingredient
2. Common UK examples: Oxycodone = OxyContin = Oxypro MR = OxyNorm (all oxycodone), Paracetamol = Panadol = Calpol
3. Do NOT flag extended-release vs immediate-release as duplicates - these are intentionally different formulations
4. Do NOT flag different medications in the same drug class (e.g., Ramipril vs Lisinopril are both ACE inhibitors but different drugs)
5. Focus on potential prescription errors or duplications

Return JSON format:
{
  "equivalences": [
    {
      "medications": ["Med1", "Med2"],
      "activeIngredient": "ingredient name",
      "explanation": "Brief explanation"
    }
  ]
}

If no equivalences found, return: {"equivalences": []}`
,
            temperature: 0,
            maxCompletionTokens: 1000,
            seed: DETERMINISTIC_SEED,
            responseFormat: { type: "json_object" },
            useCache: false,
          });

          const equivalenceContent = equivalenceResponse.restoredText || "{}";
          const equivalenceData = parseJsonFromContent(equivalenceContent) || { equivalences: [] };

          if (equivalenceData.equivalences && Array.isArray(equivalenceData.equivalences)) {
            equivalenceData.equivalences.forEach((eq: any) => {
              if (eq.medications && eq.medications.length >= 2) {
                warnings.push({
                  type: "medication_equivalence",
                  severity: "high",
                  medication: eq.medications.join(", "),
                  description: `WARNING: ${eq.medications.join(" and ")} appear to be the same medication (${eq.activeIngredient}). ${eq.explanation}`,
                  recommendedAction: "Review prescription - possible duplicate. Verify with prescriber if this is intentional (e.g., different release forms)."
                });
              }
            });
          }
          
          console.log(`DEBUG: Medication equivalence check found ${equivalenceData.equivalences?.length || 0} potential duplicates`);
        } catch (eqError) {
          console.error("Medication equivalence check error:", eqError);
          // Non-fatal - continue with other checks
        }
      }

      // =====================================================================
      // CHECK 4: COUNT CODES FOR MEDICATION LEVEL
      // Only count codes from NON-PRN medications to determine service user type
      // PRN is a medication TYPE (as-needed), not a care level like AD/AS/P
      // =====================================================================
      const codeCounts: { [key: string]: number } = { AD: 0, AS: 0, P: 0 };
      const prnCodeCounts: { [key: string]: number } = { PRN: 0, "PRN-R": 0, F: 0, MU: 0, NH: 0, R: 0 }; // Separate counts for PRN medication codes
      
      allEntries.forEach((entry: any) => {
        const code = (entry.code || "").toUpperCase();
        const isPrnMed = prnMedIds.has(entry.medicationId);
        
        if (isPrnMed) {
          // PRN medications use PRN, PRN-R (refused), F (family administered), MU, NH, R codes
          if (code === "PRN") prnCodeCounts.PRN++;
          if (code === "PRN-R") prnCodeCounts["PRN-R"]++;
          if (code === "F") prnCodeCounts.F++;
          if (code === "MU") prnCodeCounts.MU++;
          if (code === "NH") prnCodeCounts.NH++;
          if (code === "R") prnCodeCounts.R++;
        } else {
          // Non-PRN medications use AD, AS, P codes for care level
          if (code === "AD") codeCounts.AD++;
          if (code === "AS") codeCounts.AS++;
          if (code === "P") codeCounts.P++;
        }
      });

      let serviceUserType: "administer" | "assist" | "prompt" = "administer";
      // Find the dominant code type from NON-PRN medications only
      const maxCount = Math.max(codeCounts.AD, codeCounts.AS, codeCounts.P);
      if (maxCount > 0) {
        if (codeCounts.AS === maxCount) {
          serviceUserType = "assist";
        } else if (codeCounts.P === maxCount) {
          serviceUserType = "prompt";
        } else {
          serviceUserType = "administer";
        }
      }

      // Check for code mixing - ONLY on non-PRN medications
      // PRN codes on PRN medications are expected and not a conflict
      const usedLevelCodes = [];
      if (codeCounts.AD > 0) usedLevelCodes.push("AD");
      if (codeCounts.AS > 0) usedLevelCodes.push("AS");
      if (codeCounts.P > 0) usedLevelCodes.push("P");
      
      const codeConflictDetected = usedLevelCodes.length > 1;
      let codeConflictDetails = "";
      if (codeConflictDetected) {
        codeConflictDetails = `Mixed codes on regular medications: ${usedLevelCodes.join(", ")}. AD=${codeCounts.AD}, AS=${codeCounts.AS}, P=${codeCounts.P}`;
        warnings.push({
          type: "code_conflict",
          severity: "high",
          medication: "Regular medications (non-PRN)",
          description: codeConflictDetails + ". Service user should have ONE medication level.",
          recommendedAction: "Review medication level with pharmacy and update EMAR system"
        });
      }

      // =====================================================================
      // CHECK 5: TRACK ENTRIES (for debugging and statistics)
      // NOTE: We NO LONGER flag missing entries as discrepancies.
      // White blank boxes are normal - only RED blank boxes (code "MISSED") are issues.
      // =====================================================================
      
      // Debug: Show extracted entries by medicationId
      const entryMedIds = new Set(allEntries.map((e: any) => e.medicationId));
      console.log("DEBUG: Entry medicationIds:", Array.from(entryMedIds));
      console.log("DEBUG: Medication IDs in metadata:", medications.map((m: any) => `${m.medicationId}:${m.name}`).slice(0, 5));
      
      // Create a set of all extracted entry keys using medicationId for deterministic matching
      const extractedKeys = new Set<string>();
      allEntries.forEach((entry: any) => {
        const key = `${entry.medicationId}|${entry.date}|${entry.timeSlot}`;
        extractedKeys.add(key);
      });
      
      console.log("DEBUG: Extracted keys count:", extractedKeys.size);
      
      // Count how many cells are filled vs blank (for statistics only - not creating discrepancies)
      // Blank cells = "call cancelled" - meaning the care visit was cancelled and no medication was needed
      // These are NOT discrepancies and require no further action
      let filledCells = 0;
      let callCancelledCount = 0; // Blank cells indicate call was cancelled
      
      medications.forEach((med: any) => {
        if (med.isPRN) return; // Skip PRN meds - blanks are expected
        
        const medId = med.medicationId;
        const medScheduledSlots = med.scheduledTimeSlots && med.scheduledTimeSlots.length > 0 
          ? med.scheduledTimeSlots 
          : timeSlots;
        
        allDates.forEach((date: string) => {
          medScheduledSlots.forEach((slot: string) => {
            const key = `${medId}|${date}|${slot}`;
            if (extractedKeys.has(key)) {
              filledCells++;
            } else {
              callCancelledCount++; // Blank cell = call cancelled, NOT a discrepancy
            }
          });
        });
      });
      
      console.log(`DEBUG: Grid statistics - ${filledCells} filled cells, ${callCancelledCount} call cancelled (blank cells are NOT discrepancies)`);

      // =====================================================================
      // CHECK 5.9: GRID BASELINE CROSS-CHECK (BEFORE discrepancy validation)
      // Purpose: if the deterministic grid scan sees important non-admin codes
      // but AI extraction missed them, we still surface them as discrepancies.
      // =====================================================================
      if (gridBaseline && Array.isArray(gridBaseline.cells) && gridBaseline.cells.length > 0) {
        const normalizeLoose = (s: unknown) =>
          String(s || "")
            .toLowerCase()
            .replace(/[–—]/g, "-")
            .replace(/\s+/g, " ")
            .trim();

        const normalizeTimeSlotKey = (s: unknown) =>
          normalizeLoose(s).replace(/\s*/g, "").replace(/\./g, ":");

        const normalizeDateKey = (s: unknown) =>
          normalizeLoose(s)
            .replace(/,/g, "")
            .replace(/\s+/g, " ")
            .trim();

        const normalizeCodeLoose = (raw: unknown): string => {
          const input = String(raw || "").toUpperCase().trim();
          if (!input) return "";
          let code = input
            .replace(/[()\[\]{}]/g, "")
            .replace(/[–—]/g, "-")
            .replace(/\s+/g, "");

          // Common variants
          if (code === "F" || code === "FA" || code === "FAMILY" || code === "FAM" || code === "F/A") return "F";
          if (code === "S/A" || code === "S-A") return "SA";
          if (code === "M/U" || code === "MU") return "MU";
          if (code === "N/H" || code === "NH") return "NH";
          if (code === "A/D") return "AD";
          if (code === "A/S") return "AS";
          if (code === "PRNR" || code === "PRNREFUSED" || code === "PRNREFUS" || code === "PRNREF" || code === "PRNRF") return "PRN-R";
          if (code === "NOTHOME") return "NH";
          if (code === "SELADMIN" || code === "SELFADMIN") return "SA";
          if (code === "MEDUNAV" || code === "MEDUNAVAILABLE" || code === "UNAVAILABLE") return "MU";
          if (code === "REFUSED" || code === "REFUSE" || code === "REF") return "R";
          if (code === "NA" || code === "N/A") return "N/A";

          return code;
        };

        const normalizeMedKeyStrict = (s: unknown) =>
          normalizeMedicationKey(String(s || ""))
            .replace(/\b(tablets?|tabs?|capsules?|caps|cap|patch|spray|drop|drops)\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const normalizeMedKeyLoose = (s: unknown) =>
          normalizeMedKeyStrict(s)
            .replace(/\b(mg|mcg|g|ml|iu|units?|unit)\b/g, " ")
            .replace(/\b\d+(?:\.\d+)?\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const buildMedKey = (name: string) => ({
          strictKey: normalizeMedKeyStrict(name),
          looseKey: normalizeMedKeyLoose(name)
        });

        // Build AI extraction index by (med/date/timeSlot)
        const aiMedKeys: Array<{ name: string; strictKey: string; looseKey: string }> = (medications || [])
          .map((m: any) => ({ ...buildMedKey(m?.name || ""), name: m?.name }))
          .filter((m: any) => m.strictKey || m.looseKey);

        const findBestAiMedKey = (
          gridMed: string
        ): { name: string; strictKey: string; looseKey: string; matchKey: string; matchMode: "strict" | "loose" } | null => {
          const gridKeys = buildMedKey(gridMed || "");
          if (!gridKeys.strictKey && !gridKeys.looseKey) return null;

          if (gridKeys.strictKey) {
            const exactMatches = aiMedKeys.filter((m) => m.strictKey === gridKeys.strictKey);
            if (exactMatches.length === 1) {
              const match = exactMatches[0];
              return { ...match, matchKey: match.strictKey, matchMode: "strict" };
            }
            if (exactMatches.length > 1) {
              return null; // ambiguous strict match
            }

            let bestStrict: { name: string; strictKey: string; looseKey: string } | null = null;
            let bestStrictScore = 0;
            for (const m of aiMedKeys) {
              if (!m.strictKey) continue;
              const hit = m.strictKey.includes(gridKeys.strictKey) || gridKeys.strictKey.includes(m.strictKey);
              if (!hit) continue;
              const score = Math.min(m.strictKey.length, gridKeys.strictKey.length);
              if (score > bestStrictScore) {
                bestStrictScore = score;
                bestStrict = m;
              }
            }
            if (bestStrictScore >= 8 && bestStrict) {
              return { ...bestStrict, matchKey: bestStrict.strictKey, matchMode: "strict" };
            }
          }

          if (!gridKeys.looseKey) return null;

          let best: { name: string; strictKey: string; looseKey: string } | null = null;
          let bestScore = 0;
          for (const m of aiMedKeys) {
            if (!m.looseKey) continue;
            const hit = m.looseKey.includes(gridKeys.looseKey) || gridKeys.looseKey.includes(m.looseKey);
            if (!hit) continue;
            const score = Math.min(m.looseKey.length, gridKeys.looseKey.length);
            if (score > bestScore) {
              bestScore = score;
              best = m;
            }
          }
          return bestScore >= 5 && best
            ? { ...best, matchKey: best.looseKey, matchMode: "loose" }
            : null;
        };

        const slotKey = (medKey: string, date: unknown, timeSlot: unknown) =>
          `${medKey}|${normalizeDateKey(date)}|${normalizeTimeSlotKey(timeSlot)}`;

        const aiCodesByStrictSlot = new Map<string, Set<string>>();
        const aiCodesByLooseSlot = new Map<string, Set<string>>();
        for (const entry of allEntries) {
          const med = medications.find((m: any) => m.medicationId === entry.medicationId);
          const medKeys = buildMedKey(med?.name || entry.medication);
          const code = normalizeCodeLoose(entry.code);
          if (medKeys.strictKey) {
            const key = slotKey(medKeys.strictKey, entry.date, entry.timeSlot);
            if (!aiCodesByStrictSlot.has(key)) aiCodesByStrictSlot.set(key, new Set());
            if (code) aiCodesByStrictSlot.get(key)!.add(code);
          }
          if (medKeys.looseKey) {
            const key = slotKey(medKeys.looseKey, entry.date, entry.timeSlot);
            if (!aiCodesByLooseSlot.has(key)) aiCodesByLooseSlot.set(key, new Set());
            if (code) aiCodesByLooseSlot.get(key)!.add(code);
          }
        }

        // Dedupe against existing discrepancies (by med/date/timeSlot/code)
        const existingDiscKeys = new Set<string>();
        for (const d of discrepancies) {
          const medKeys = buildMedKey(d.medication || "");
          const codeKey = `|${normalizeCodeLoose(d.code)}`;
          if (medKeys.strictKey) {
            const key = slotKey(medKeys.strictKey, d.date, d.timeSlot) + codeKey;
            existingDiscKeys.add(key);
          }
          if (medKeys.looseKey) {
            const key = slotKey(medKeys.looseKey, d.date, d.timeSlot) + codeKey;
            existingDiscKeys.add(key);
          }
        }

        const IMPORTANT_CODES = new Set(["R", "PRN-R", "MU", "NH", "SA", "MISSED"]);
        const verificationNotes: Record<string, string> = {
          MU: "Check if medication unavailability is documented and escalated",
          NH: "Check if not home status is documented",
          SA: "Check if self-administration was appropriate and witnessed",
          MISSED: "Check why the medication was missed and ensure it is documented",
        };
        const pushVerificationItem = (
          code: string,
          context: { careWorkerName: string; date: string; medication: string; note?: string }
        ) => {
          const baseNote =
            code === "PRN-R"
              ? "Check if PRN refusal reason is documented and acceptable"
              : code === "R"
                ? "Check if refusal reason is documented and acceptable"
                : verificationNotes[code] || "Check if this entry is documented appropriately";
          const note = context.note ? `${baseNote} ${context.note}` : baseNote;
          verificationItems.push({
            careWorkerName: context.careWorkerName,
            date: context.date,
            medication: context.medication,
            code,
            note,
          });
        };
        const baselineVerificationKeys = new Set<string>();
        const pushBaselineVerification = (
          code: string,
          context: { careWorkerName: string; date: string; medication: string; note?: string },
          slotKeyValue: string
        ) => {
          const key = `${slotKeyValue}|${code}`;
          if (baselineVerificationKeys.has(key)) return;
          baselineVerificationKeys.add(key);
          pushVerificationItem(code, context);
        };
        let missingImportant = 0;
        let mismatchImportant = 0;
        let scannedImportant = 0;

        for (const cell of gridBaseline.cells) {
          const rawCode = (() => {
            const primary = normalizeCodeLoose(cell.code);
            if (primary && primary !== "BLANK" && primary !== "N/A") return primary;
            return normalizeCodeLoose(extractCellCode(cell.content));
          })();
          const code = rawCode === "PRN" && !hasExplicitTimeInCell(cell) ? "PRN-R" : rawCode;
          if (!code || !IMPORTANT_CODES.has(code)) continue;
          scannedImportant++;

          const medMatch = findBestAiMedKey(cell.medication);
          const fallbackSlotKey = slotKey(
            normalizeMedKeyLoose(cell.medication || "") || cell.medication || "unknown",
            cell.date,
            cell.timeSlot
          );

          if (!medMatch) {
            const careWorkerName = cell.careWorker || "N.N.";
            const medicationName = cell.medication || "Unknown medication";
            pushBaselineVerification(code, {
              careWorkerName,
              date: cell.date,
              medication: medicationName,
              note: "Grid scan detected this code but medication matching was ambiguous."
            }, fallbackSlotKey);
            missingImportant++;
            continue;
          }

          const sKey = slotKey(medMatch.matchKey, cell.date, cell.timeSlot);
          const codes = medMatch.matchMode === "strict"
            ? aiCodesByStrictSlot.get(sKey)
            : aiCodesByLooseSlot.get(sKey);

          const discKey = sKey + `|${code}`;
          if (existingDiscKeys.has(discKey)) continue;

          const careWorkerName = cell.careWorker || "N.N.";
          const medicationName = medMatch.name || cell.medication;

          const isRefusal = code === "R" || code === "PRN-R";
          const isMissed = code === "MISSED";
          const needsVerification = code === "MU" || code === "NH" || code === "SA";

          if (!codes || codes.size === 0) {
            missingImportant++;

            if (isRefusal) {
              pushBaselineVerification(code, { careWorkerName, date: cell.date, medication: medicationName }, sKey);
            } else if (isMissed) {
              pushBaselineVerification(code, { careWorkerName, date: cell.date, medication: medicationName }, sKey);
            } else if (needsVerification) {
              pushBaselineVerification(code, { careWorkerName, date: cell.date, medication: medicationName }, sKey);
            }
            continue;
          }

          if (!codes.has(code)) {
            mismatchImportant++;
            const extractedCodes = Array.from(codes).join(", ");
            const mismatchNote = `(grid shows "${code}" but extraction captured "${extractedCodes}")`;

            if (isRefusal) {
              pushBaselineVerification(code, {
                careWorkerName,
                date: cell.date,
                medication: medicationName,
                note: mismatchNote,
              }, sKey);
            } else if (isMissed) {
              pushBaselineVerification(code, {
                careWorkerName,
                date: cell.date,
                medication: medicationName,
                note: mismatchNote,
              }, sKey);
            } else if (needsVerification) {
              pushBaselineVerification(code, {
                careWorkerName,
                date: cell.date,
                medication: medicationName,
                note: mismatchNote,
              }, sKey);
            }
          }
        }

      if (scannedImportant > 0 && (missingImportant > 0 || mismatchImportant > 0)) {
        warnings.push({
          type: "grid_baseline_mismatch",
          severity: missingImportant > 0 ? "high" : "medium",
          medication: "Multiple",
          description: `Baseline grid scan found ${scannedImportant} important non-admin code cells. Extraction missed ${missingImportant} and mismatched ${mismatchImportant}.`,
          recommendedAction: "Review the affected rows/cells in the original EMAR. Consider re-running analysis or uploading a cleaner PDF export if available."
        });
      }
    }

    // If the EMAR key lists specific codes, flag any cells containing other codes for manual verification.
    if (gridBaseline?.cells?.length) {
      const keyMismatchSeen = new Set<string>();
      for (const cell of gridBaseline.cells) {
        if (!cell.keyMismatch || !cell.detectedCode) continue;
        const medName = cell.medication || "Unknown medication";
        const date = cell.date || "Unknown date";
        const slot = cell.timeSlot || "Unknown slot";
        const mismatchKey = `${medName}|${date}|${slot}|${cell.detectedCode}`;
        if (keyMismatchSeen.has(mismatchKey)) continue;
        keyMismatchSeen.add(mismatchKey);
        verificationItems.push({
          careWorkerName: cell.careWorker || "N.N.",
          date,
          medication: medName,
          medicationId: cell.medicationId || undefined,
          code: "KEY-MISMATCH",
          timeSlot: slot,
          note: `Cell shows code "${cell.detectedCode}" but it is not listed in the EMAR key. Verify this cell manually.`
        });
      }

      if (keyMismatchSeen.size > 0) {
        warnings.push({
          type: "key_code_mismatch",
          severity: "medium",
          medication: "Multiple",
          description: `Found ${keyMismatchSeen.size} cells with codes not listed in the EMAR key.`,
          recommendedAction: "Verify these cells against the EMAR key and confirm the correct code."
        });
      }
    }

      // =====================================================================
      // CHECK 6: VALIDATE EXTRACTED ENTRIES (for codes like R, MU, NH, SA)
      // =====================================================================
      allEntries.forEach((entry: any) => {
        const normalizedCode = normalizeEmarCode(entry.code || "");
        const code = normalizedCode || (entry.code || "").toUpperCase();
        const careWorker = entry.careWorker || "";
        const date = entry.date || "";
        const timeSlot = entry.timeSlot || "";
        const medication = entry.medication || "";
        const entryMedId = Number(entry.medicationId) || 0;
        const isPrnByCode = code.startsWith("PRN");
        const isPRN =
          (entryMedId > 0 &&
            (prnMedIds.has(entryMedId) || canonicalInferredPrnMedicationIds.has(entryMedId))) ||
          isPrnByCode;

        // CHECK 5a: R (Refused) or PRN-R (PRN Refused) - verification only
        if (code === "R" || code === "PRN-R") {
          const isPrnRefusal = code === "PRN-R";
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            medicationId: entryMedId || undefined,
            code: code,
            note: isPrnRefusal 
              ? "Check if PRN refusal reason is documented and acceptable"
              : "Check if refusal reason is documented and acceptable"
          });
        }

        // CHECK 5b: MISSED entries (red highlighted blank boxes) - verification only
        // Note: White/normal blank boxes are NOT extracted
        if (code === "MISSED") {
          verificationItems.push({
            careWorkerName: careWorker || "N.N.",
            date: date,
            medication: medication,
            medicationId: entryMedId || undefined,
            code: "MISSED",
            note: "Check why the medication was missed and ensure it is documented"
          });
        }

        // CHECK 5c: MU, NH, SA require verification
        if (code === "MU") {
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            medicationId: entryMedId || undefined,
            code: "MU",
            note: "Check if medication unavailability is documented and escalated"
          });
        }

        if (code === "NH") {
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            medicationId: entryMedId || undefined,
            code: "NH",
            note: "Check if not home status is documented"
          });
        }

        if (code === "SA") {
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            medicationId: entryMedId || undefined,
            code: "SA",
            note: "Check if self-administration was appropriate and witnessed"
          });
        }

        // Family-administered (F) does not require verification.

        // =====================================================================
        // CHECK 5d: PRN CODE MISUSE - Wrong codes for medication type
        // =====================================================================
        const PRN_CODES = ['PRN', 'PRN-AD', 'PRN-AS', 'PRN-R'];
        
        // Check 1: PRN codes used on non-PRN medications
        if (PRN_CODES.includes(code) && !isPRN) {
          // PRN-R is treated as a red-code verification rather than a discrepancy.
          if (code !== "PRN-R") {
	            discrepancies.push({
	              careWorkerName: careWorker,
	              date: date,
	              timeSlot: timeSlot,
	              medication: medication,
	              medicationId: entryMedId || undefined,
	              code: code,
	              issue: `PRN code "${code}" used on regular medication - not prescribed as PRN`,
	              severity: "high",
	              actions: { performanceNote: true, meeting: "phone", referToManager: true }
	            });
          }
        }
        
        // Check 2: Invalid codes (AD/AS/P) used on PRN medications
        // PRN meds should use PRN codes only (shows as "PRN" in blue on EMAR)
        const INVALID_PRN_CODES = ['AD', 'AS', 'P'];
        if (INVALID_PRN_CODES.includes(code) && isPRN) {
          discrepancies.push({
            careWorkerName: careWorker,
            date: date,
            timeSlot: timeSlot,
            medication: medication,
            medicationId: entryMedId || undefined,
            code: code,
            issue: `Invalid code "${code}" used on PRN medication - should use PRN codes (PRN, PRN-AD, PRN-AS, PRN-R)`,
            severity: "high",
            actions: { performanceNote: true, meeting: "phone", referToManager: false }
          });
        }
        
        // =====================================================================
        // CHECK 5e: INVALID CODES FOR ADMINISTERED MEDICATIONS
        // =====================================================================
        // For Administered medications (non-PRN), only these codes are valid:
        // AD (Administered), AS (Assisted), P (Prompted), SA (Self Administered),
        // NH (Not Home), R (Refused), F (Family Administered), MU (Medication Unavailable)
        const VALID_ADMIN_CODES = ['AD', 'AS', 'P', 'SA', 'NH', 'R', 'F', 'MU'];
        
        // Only check non-PRN medications - PRN meds have their own valid codes
        if (!isPRN && code && !VALID_ADMIN_CODES.includes(code)) {
          // If it's a PRN-style code on a non-PRN med, CHECK 5d already raised a more specific issue.
          // Avoid double-reporting the same underlying problem.
          if (PRN_CODES.includes(code)) {
            return;
          }
          // Skip blank/empty codes
          if (code !== '' && code !== 'BLANK' && code !== 'EMPTY') {
            discrepancies.push({
              careWorkerName: careWorker,
              date: date,
              timeSlot: timeSlot,
              medication: medication,
              medicationId: entryMedId || undefined,
              code: code,
              issue: `Invalid code "${code}" used on administered medication - valid codes are: AD, AS, P, SA, NH, R, F, MU`,
              severity: "high",
              actions: { performanceNote: true, meeting: "phone", referToManager: true }
            });
          }
        }
      });

      // =====================================================================
      // CHECK 6: TIME GAP VIOLATIONS (ALL ADMINISTERED MEDICATIONS)
      // =====================================================================
      // Time gap detection applies to ALL medications where doses were administered
      // on the same day. Checks for minimum required gap between doses.
      //
      // Included administration codes: AD, AS, PRN-AD, PRN-AS, ADMINISTERED, GIVEN
      // Excluded codes: BLANK, EMPTY, MU, NH, R, F, MISSED, SA (self-admin)
      // =====================================================================
      
      // Helper to extract time from entry - check both time field and timeSlot
      const extractTimeFromEntry = (entry: any): string | null => {
        // Only use explicit admin times recorded in the cell (not time-slot ranges).
        const timeStr = (entry.time || "").trim();
        if (!computeHasTime(entry)) return null;
        if (timeStr && timeStr.includes(":")) {
          return timeStr;
        }
        const tokenMatch = timeStr.match(/\b(?:0?[0-9]|1[0-9]|2[0-3])[:.]?[0-5][0-9](?:\s*(?:am|pm|AM|PM))?\b/);
        return tokenMatch ? tokenMatch[0] : null;
      };
      
      // Check if code indicates medication was administered (not assisted)
      // AS = Assisted (carer helped but didn't administer) - excluded from time checks
      const isAdministeredCode = (code: string): boolean => {
        const upperCode = code.toUpperCase();
        // Include administration codes, but NOT AS (Assisted)
        return ["AD", "PRN-AD", "ADMINISTERED", "GIVEN", "PRN", "G"].includes(upperCode) ||
               upperCode.startsWith("PRN-AD") || // PRN-AD variations only
               upperCode === "A"; // Single letter A for administered
      };
      
      console.log(`DEBUG: Total entries to check for time gaps: ${allEntries.length}`);
      
      // Debug: Log all unique dates found in entries to diagnose date extraction issues
      const allUniqueDates = new Set<string>();
      allEntries.forEach((entry: any) => {
        const entryDate = (entry.date || "").trim();
        if (entryDate) allUniqueDates.add(entryDate);
      });
      console.log(`DEBUG: Unique dates found in entries: ${Array.from(allUniqueDates).join(", ")}`);
      
      // Log sample of entries with dates for diagnosis
      const sampleEntries = allEntries.slice(0, 10);
      console.log(`DEBUG: Sample entries for date diagnosis:`);
      sampleEntries.forEach((e: any, i: number) => {
        console.log(`  [${i}] ${e.medication} | date="${e.date}" | timeSlot="${e.timeSlot}" | time="${e.time}" | code="${e.code}"`);
      });
      
      const medDateEntriesForTimeGap = new Map<string, any[]>();
      let administeredEntriesFound = 0;
      let entriesWithTimes = 0;
      
      allEntries.forEach((entry: any) => {
        const code = (entry.code || "").toUpperCase();
        
        // Skip non-administration codes (blanks, refusals, unavailable, etc.)
        if (["BLANK", "EMPTY", "", "MU", "NH", "R", "F", "MISSED", "SA"].includes(code)) return;
        
        // Only include entries where medication was actually administered
        if (!isAdministeredCode(code)) return;

        const entryMedId = Number(entry.medicationId) || 0;
        
        // Skip office-closed entries from time gap checks (manually closed by office staff)
        if (entry.isOfficeClosed) {
          console.log(`DEBUG: Skipping office-closed entry from time gap check: ${entry.medication} on ${entry.date}`);
          return;
        }
        
        // CRITICAL: Must have care worker initials to be a valid administration
        // Empty time slots (crossed out boxes) won't have initials
        const careWorkerInitials = (entry.careWorkerInitials || entry.careWorker || "").trim();
        if (!careWorkerInitials || careWorkerInitials.length < 1) {
          console.log(`DEBUG: Skipping entry without care worker initials: ${entry.medication} on ${entry.date}`);
          return;
        }
        
        // Skip entries without valid dates (prevents cross-day false positives)
        const entryDate = (entry.date || "").trim();
        if (!entryDate || entryDate.length < 3) {
          return;
        }
        
        // Validate date has enough specificity to distinguish days
        // Must contain a day number (1-31) to be valid for comparison
        const dayNumberMatch = entryDate.match(/\b(\d{1,2})\b/);
        if (!dayNumberMatch) {
          console.log(`DEBUG: Skipping entry with non-specific date: "${entryDate}" for ${entry.medication}`);
          return;
        }
        
        // Extract time from entry - must have a valid time to compare gaps
        const timeValue = extractTimeFromEntry(entry);
        if (!timeValue) {
          console.log(`DEBUG: Skipping entry without valid time: ${entry.medication} on ${entryDate}`);
          return;
        }
        
        administeredEntriesFound++;
        entriesWithTimes++;
        
        // Extract a canonical date key: day number + month abbreviation
        // This ensures "Sun, 21 Dec" and "21 Dec" both map to "21-dec"
        // But "21 Dec" and "23 Dec" stay separate
        let canonicalDateKey = entryDate.toLowerCase().trim();
        
        // Try to extract day number and month for a cleaner key
        const dayMonthMatch = entryDate.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
        if (dayMonthMatch) {
          const dayNum = dayMonthMatch[1].padStart(2, '0');
          const month = dayMonthMatch[2].toLowerCase();
          canonicalDateKey = `${dayNum}-${month}`;
        }
        
        const medId = entryMedId;
        const isPRN =
          (medId > 0 &&
            (prnMedIds.has(medId) || canonicalInferredPrnMedicationIds.has(medId))) ||
          code.includes("PRN");
        const medKey = medId > 0 ? `id:${medId}` : `name:${entry.medication || ""}`;
        const key = `${medKey}|${canonicalDateKey}`;
        
        console.log(`DEBUG: Valid administration for gap check: ${entry.medication} on "${entryDate}" (key: ${canonicalDateKey}) at ${timeValue} by ${careWorkerInitials}`);
        
        if (!medDateEntriesForTimeGap.has(key)) medDateEntriesForTimeGap.set(key, []);
        medDateEntriesForTimeGap.get(key)!.push({ ...entry, extractedTime: timeValue, isPRN, originalDate: entryDate });
      });
      
      console.log(`DEBUG: Administered entries found: ${administeredEntriesFound}, with valid times: ${entriesWithTimes}`);

      // DEDUPLICATION: Multiple time slot rows may record the same administration
      // If entries are within 1 hour of each other on the same day, they're likely duplicates
      // Keep only the earliest one
      medDateEntriesForTimeGap.forEach((dayEntries, key) => {
        if (dayEntries.length <= 1) return;
        
        // Sort by time
        dayEntries.sort((a: any, b: any) => {
          const [aH, aM] = a.extractedTime.split(":").map(Number);
          const [bH, bM] = b.extractedTime.split(":").map(Number);
          return (aH * 60 + aM) - (bH * 60 + bM);
        });
        
        // Filter out entries that are within 1 hour of a previous entry (likely duplicates from different time slots)
        const deduped: any[] = [];
        for (const entry of dayEntries) {
          const [h, m] = entry.extractedTime.split(":").map(Number);
          const entryMinutes = h * 60 + m;
          
          // Check if this is too close to any existing entry
          const isDuplicate = deduped.some((existing: any) => {
            // Only dedupe when the original dates match; otherwise we risk collapsing entries from different days
            if (existing.originalDate !== entry.originalDate) return false;
            const [eH, eM] = existing.extractedTime.split(":").map(Number);
            const existingMinutes = eH * 60 + eM;
            const diff = Math.abs(entryMinutes - existingMinutes);
            return diff < 60; // Within 1 hour = likely same administration
          });
          
          if (!isDuplicate) {
            deduped.push(entry);
          } else {
            console.log(`DEBUG: Deduped entry for ${entry.medication} at ${entry.extractedTime} (too close to existing entry)`);
          }
        }
        
        // Replace with deduplicated entries
        medDateEntriesForTimeGap.set(key, deduped);
      });
      
      console.log(`DEBUG: After deduplication, checking gaps for ${medDateEntriesForTimeGap.size} medication-day combinations`);

      medDateEntriesForTimeGap.forEach((dayEntries, key) => {
        // Need at least 2 entries to compare
        if (dayEntries.length < 2) return;
        
        const [medKeyPart, dateKey] = key.split("|");
        const medId = medKeyPart?.startsWith("id:") ? Number(medKeyPart.slice(3)) || 0 : 0;
        const medication =
          medId > 0
            ? medNameById.get(medId) || dayEntries[0]?.medication || ""
            : medKeyPart?.startsWith("name:")
              ? medKeyPart.slice(5)
              : dayEntries[0]?.medication || "";
        
        const scheduledSlots = medId > 0 ? medScheduledSlotCountById.get(medId) || 1 : 1;
        
        // Use configured gap if available, otherwise 4 hours for PRN, 4 hours for regular meds
        const requiredGap = medId > 0 ? medGapHoursById.get(medId) || 4 : 4; // Default 4 hours minimum between doses
        
        // Verify all entries have the same original date (prevent cross-day false positives)
        const uniqueDates = new Set(dayEntries.map((e: any) => e.originalDate));
        if (uniqueDates.size > 1) {
          console.log(`DEBUG: WARNING - Multiple dates found in same group for ${medication}: ${Array.from(uniqueDates).join(", ")}`);
          // Don't compare entries from different days
          return;
        }
        
        console.log(`DEBUG: Checking time gaps for ${medication} on "${dateKey}": ${dayEntries.length} entries, required gap: ${requiredGap}h, scheduled slots: ${scheduledSlots}`);
        
        // Sort entries by extracted time
        const sortedEntries = dayEntries.sort((a: any, b: any) => {
          const [aH, aM] = a.extractedTime.split(":").map(Number);
          const [bH, bM] = b.extractedTime.split(":").map(Number);
          return (aH * 60 + aM) - (bH * 60 + bM);
        });

        for (let i = 1; i < sortedEntries.length; i++) {
          const prev = sortedEntries[i - 1];
          const curr = sortedEntries[i];
          
          // Double-check dates match before comparing times
          if (prev.originalDate !== curr.originalDate) {
            console.log(`DEBUG: Skipping cross-day comparison: ${prev.originalDate} vs ${curr.originalDate}`);
            continue;
          }
          
          const [prevH, prevM] = prev.extractedTime.split(":").map(Number);
          const [currH, currM] = curr.extractedTime.split(":").map(Number);
          
          const prevMinutes = prevH * 60 + prevM;
          const currMinutes = currH * 60 + currM;
          const gapMinutes = currMinutes - prevMinutes;
          const gapHours = gapMinutes / 60;
          
          console.log(`DEBUG: Gap between ${prev.extractedTime} and ${curr.extractedTime} on ${curr.originalDate} = ${gapHours.toFixed(2)}h (required: ${requiredGap}h)`);

          // Skip if times are very close or identical (likely duplicate extraction)
          if (gapHours <= 0.25) { // 15 min tolerance for duplicates
            console.log(`DEBUG: Skipping near-duplicate entry for ${medication} (${gapHours.toFixed(2)}h gap)`);
            continue;
          }
          
          // Skip negative gaps (would indicate time went backwards - data issue)
          if (gapHours < 0) {
            console.log(`DEBUG: Skipping negative gap for ${medication} - possible data issue`);
            continue;
          }

          if (gapHours < requiredGap - 0.17) { // 10 min tolerance
            // SANITY CHECK: If the gap is extremely short (less than 25% of required)
            // AND the required gap is large (8+ hours for once-daily meds), 
            // this is likely a data extraction error (entries from different days wrongly grouped)
            const gapRatio = gapHours / requiredGap;
            const isLikelyDataError = gapRatio < 0.25 && requiredGap >= 8;
            
            if (isLikelyDataError) {
              console.log(`DEBUG: Skipping likely false positive - gap ${gapHours.toFixed(1)}h is <25% of required ${requiredGap}h, probably cross-day extraction error`);
              warnings.push({
                type: "possible_extraction_error",
                severity: "low",
                medication: medication,
                description: `Detected suspiciously short gap (${gapHours.toFixed(1)}h) between ${prev.extractedTime} and ${curr.extractedTime} - likely entries from different days were grouped together due to OCR/extraction issues`,
                recommendedAction: "Review original EMAR document to verify dates"
              });
              continue;
            }
            
            const isPRNEntry = prev.isPRN || curr.isPRN;
            const issueType = isPRNEntry ? "PRN medication" : "Medication";
            console.log(`DEBUG: TIME GAP VIOLATION DETECTED: ${medication} on ${curr.originalDate} - ${gapHours.toFixed(1)}h < ${requiredGap}h`);
            const recommendedSlot = curr.timeSlot ? ` Scheduled slot: ${curr.timeSlot}.` : "";
            discrepancies.push({
              careWorkerName: curr.careWorker,
              date: curr.date,
              timeSlot: curr.timeSlot,
              medication: medication,
              medicationId: medId || undefined,
              issue: `${issueType} time gap violation: Only ${gapHours.toFixed(1)} hours between doses (required: ${requiredGap} hours minimum). Previous dose at ${prev.extractedTime}, this dose at ${curr.extractedTime}.${recommendedSlot}`,
              severity: "high",
              actions: { performanceNote: true, meeting: "in_person", referToManager: true }
            });
          }
        }
      });
      
      console.log(`DEBUG: Time gap check completed for ${medDateEntriesForTimeGap.size} medication-day combinations`);

      // =====================================================================
      // CHECK 7: MU FREQUENCY WARNING
      // =====================================================================
      const muCounts = new Map<string, { count: number; medication: string; medicationId?: number }>();
      allEntries.forEach((entry: any) => {
        if ((entry.code || "").toUpperCase() === "MU") {
          const medId = Number(entry.medicationId) || 0;
          const key = medId > 0 ? `id:${medId}` : `name:${entry.medication || ""}`;
          const existing = muCounts.get(key) || {
            count: 0,
            medication: medId > 0 ? medNameById.get(medId) || entry.medication || "" : entry.medication || "",
            medicationId: medId || undefined,
          };
          existing.count += 1;
          muCounts.set(key, existing);
        }
      });

      muCounts.forEach(({ count, medication, medicationId }) => {
        if (count >= 3) {
          warnings.push({
            type: "medication_unavailable_pattern",
            severity: "medium",
            medication,
            medicationId,
            description: `Medication Unavailable (MU) recorded ${count} times`,
            recommendedAction: "Check if medication has been discontinued or if there are stock issues"
          });
        }
      });

      const nonAdminTrendCounts = { R: 0, SA: 0, F: 0, NH: 0, MU: 0 };
      allEntries.forEach((entry: any) => {
        const code = String(entry.code || "").toUpperCase();
        if (code === "R" || code === "PRN-R") nonAdminTrendCounts.R += 1;
        else if (code === "SA") nonAdminTrendCounts.SA += 1;
        else if (code === "F") nonAdminTrendCounts.F += 1;
        else if (code === "NH") nonAdminTrendCounts.NH += 1;
        else if (code === "MU") nonAdminTrendCounts.MU += 1;
      });
      const NON_ADMIN_TREND_THRESHOLD = 3;
      Object.entries(nonAdminTrendCounts).forEach(([code, count]) => {
        if (count >= NON_ADMIN_TREND_THRESHOLD) {
          const labels: Record<string, string> = {
            R: "Refused",
            SA: "Self-administered",
            F: "Family-administered",
            NH: "Not home",
            MU: "Medication unavailable",
          };
          warnings.push({
            type: "non_administration_trend",
            severity: "medium",
            medication: "Multiple medications",
            description: `${labels[code] || code} (${code}) recorded ${count} times in this audit period`,
            recommendedAction: "Review if there is an emerging trend in non-administration and document follow-up actions",
          });
        }
      });

      // =====================================================================
      // TRIPLE-CHECK VALIDATION SYSTEM
      // Pass 2: Review each discrepancy for false positives
      // Pass 3: Final confirmation with evidence
      // FAIL-SAFE: If validation fails, KEEP original discrepancies
      // =====================================================================
      
      let validatedDiscrepancies = [...discrepancies];
      const originalCount = discrepancies.length;
      let validationEvidence: Record<string, string> = {};
      let validationStatus = "not_run";
      
      if (discrepancies.length > 0 && !gridPrimaryEnabled) {
        console.log(`DEBUG: Starting triple-check validation on ${discrepancies.length} discrepancies`);
        sendProgress(85, `Validating ${discrepancies.length} potential issues...`, "validation_running");
        
        // Use document text context if available, otherwise skip text-based validation
        const docContext = analysisText || "";
        const hasTextContext = docContext.length > 100; // Meaningful text available
        
        // PASS 2: Review each discrepancy for false positives (vision-based when no text)
        const pass2SystemPrompt = hasTextContext 
          ? `You are a quality assurance reviewer for EMAR (medication) audits. Your job is to review detected discrepancies and filter out ONLY OBVIOUS FALSE POSITIVES.

ORIGINAL DOCUMENT TEXT:
${docContext}

DETECTED DISCREPANCIES TO REVIEW:
${discrepancies.map((d, i) => `[${i + 1}] ${d.date} - ${d.medication} - ${d.issue} (Care Worker: ${d.careWorkerName})`).join("\n")}

REVIEW CRITERIA - BE CONSERVATIVE:
1. ONLY mark as INVALID if you are 100% certain it's a false positive
2. If in doubt, mark as VALID to preserve the finding
3. Check if the care worker attribution is correct
4. Check if the issue description matches what the document shows

IMPORTANT: It is better to keep a potential false positive than to remove a real discrepancy.

Return JSON with indices that are VALID (keep these). Include ALL indices unless you are CERTAIN one is false:
{"validIndices": [1, 2, 3, 4, 5]}`
          : `You are a quality assurance reviewer for EMAR (medication) audits. Look at the EMAR chart images and review the detected discrepancies.

DETECTED DISCREPANCIES TO REVIEW:
${discrepancies.map((d, i) => `[${i + 1}] ${d.date} - ${d.medication} - ${d.issue} (Care Worker: ${d.careWorkerName})`).join("\n")}

REVIEW CRITERIA - BE CONSERVATIVE:
1. ONLY mark as INVALID if you are 100% certain it's a false positive based on what you see in the images
2. If in doubt, mark as VALID to preserve the finding

Return JSON with indices that are VALID (keep these). Include ALL indices unless you are CERTAIN one is false:
{"validIndices": [1, 2, 3, 4, 5]}`;

        let pass2Success = false;
        try {
          const pass2Response = await executeSecureTextCompletion({
            endpoint: "/api/admin/emar-audit",
            feature: "emar_validation_pass2",
            model: emarValidationModel,
            userContext: aiUserContext,
            systemPrompt: pass2SystemPrompt,
            userContent: hasTextContext
              ? "Review the discrepancies. Be conservative - when in doubt, keep the discrepancy."
              : [...imageContent, { type: "text", text: "Review the discrepancies based on these EMAR images. Be conservative - when in doubt, keep the discrepancy." }],
            temperature: 0,
            maxCompletionTokens: 2000,
            seed: DETERMINISTIC_SEED,
            responseFormat: { type: "json_object" },
            useCache: false,
          });

          const pass2Content = pass2Response.restoredText || "{}";
          
          try {
            const pass2Data = JSON.parse(pass2Content);
            const validIndices = pass2Data.validIndices;
            
            // Only filter if we got a valid array with at least some indices
            if (Array.isArray(validIndices) && validIndices.length > 0) {
              pass2Success = true;
              if (validIndices.length === discrepancies.length) {
                console.log(`DEBUG: Pass 2 validation - ${discrepancies.length} discrepancies retained`);
              } else {
                console.log(
                  `DEBUG: Pass 2 returned ${validIndices.length}/${discrepancies.length} valid indices - keeping all discrepancies to avoid false negatives`
                );
              }
            } else {
              // If no valid indices returned, keep all (fail safe)
              console.log(`DEBUG: Pass 2 returned empty validIndices - keeping all discrepancies`);
            }
          } catch (parseError) {
            console.error("Pass 2 JSON parse error:", parseError);
            // Keep original discrepancies if parsing fails
          }
        } catch (e) {
          console.error("Pass 2 validation error:", e);
          // Keep original discrepancies if validation fails
        }
        
        // PASS 3: Final confirmation with evidence extraction (vision-based when no text)
        if (validatedDiscrepancies.length > 0) {
          const pass3SystemPrompt = hasTextContext
            ? `You are the FINAL quality check for EMAR audit discrepancies.

DOCUMENT TEXT:
${docContext}

DISCREPANCIES TO CONFIRM:
${validatedDiscrepancies.map((d, i) => `[${i + 1}] ${d.date} - ${d.medication} - ${d.issue} (Care Worker: ${d.careWorkerName})`).join("\n")}

For EACH discrepancy, provide evidence if you can find it. If you cannot find evidence, the discrepancy may still be valid.

IMPORTANT: Do NOT remove discrepancies just because you cannot find explicit text evidence. The original detection used structured data analysis.

Return JSON - include ALL discrepancy indices by default, and add evidence where you can find it:
{"confirmedIndices": [1, 2, 3], "evidence": {"1": "Code 'R' visible for Paracetamol at 08:00", "2": "Could not locate specific text but detection appears valid"}}`
            : `You are the FINAL quality check for EMAR audit discrepancies. Look at the EMAR chart images.

DISCREPANCIES TO CONFIRM:
${validatedDiscrepancies.map((d, i) => `[${i + 1}] ${d.date} - ${d.medication} - ${d.issue} (Care Worker: ${d.careWorkerName})`).join("\n")}

Look at the images and provide evidence if visible. Do NOT remove discrepancies just because you cannot see clear evidence.

Return JSON - include ALL discrepancy indices by default, and add evidence where you can find it:
{"confirmedIndices": [1, 2, 3], "evidence": {"1": "Code 'R' visible in image", "2": "Detection appears valid"}}`;

          try {
            const pass3Response = await executeSecureTextCompletion({
              endpoint: "/api/admin/emar-audit",
              feature: "emar_validation_pass3",
              model: emarValidationModel,
              userContext: aiUserContext,
              systemPrompt: pass3SystemPrompt,
              userContent: hasTextContext
                ? "Confirm discrepancies and provide evidence where possible. Keep discrepancies even without explicit text evidence."
                : [...imageContent, { type: "text", text: "Confirm discrepancies based on these EMAR images. Provide evidence where visible. Keep discrepancies even without clear visual evidence." }],
              maxCompletionTokens: 2000,
              temperature: 0,
              seed: DETERMINISTIC_SEED,
              responseFormat: { type: "json_object" },
              useCache: false,
            });

            const pass3Content = pass3Response.restoredText || "{}";
            
            try {
              const pass3Data = JSON.parse(pass3Content);
              const confirmedIndices = pass3Data.confirmedIndices;
              
              // Only filter if we got valid indices; otherwise keep all
              if (Array.isArray(confirmedIndices) && confirmedIndices.length > 0) {
                if (pass3Data.evidence) {
                  validationEvidence = pass3Data.evidence;
                }

                if (confirmedIndices.length < validatedDiscrepancies.length) {
                  validationStatus = "partial";
                  console.log(
                    `DEBUG: Pass 3 returned ${confirmedIndices.length}/${validatedDiscrepancies.length} confirmed - keeping all discrepancies`
                  );
                } else {
                  validationStatus = "completed";
                  console.log(`DEBUG: Pass 3 confirmation - kept ${validatedDiscrepancies.length} discrepancies`);
                }
              } else {
                // Keep all if no confirmedIndices returned
                validationStatus = "partial";
                console.log(`DEBUG: Pass 3 returned empty confirmedIndices - keeping all discrepancies`);
              }
            } catch (parseError) {
              console.error("Pass 3 JSON parse error:", parseError);
              validationStatus = pass2Success ? "partial" : "failed";
              // Keep pass 2 results if parsing fails
            }
          } catch (e) {
            console.error("Pass 3 validation error:", e);
            validationStatus = pass2Success ? "partial" : "failed";
            // Keep pass 2 results if pass 3 fails
          }
        } else {
          validationStatus = pass2Success ? "completed" : "failed";
        }
      } else if (discrepancies.length > 0 && gridPrimaryEnabled) {
        validationStatus = "not_run";
        validationEvidence.gridMode = "Grid parser mode - AI validation skipped for speed.";
        sendProgress(85, "Skipping AI validation (grid mode)...", "validation_skipped");
      }
      
      console.log(`DEBUG: Triple-check complete - ${originalCount} initial -> ${validatedDiscrepancies.length} confirmed (status: ${validationStatus})`);
      sendProgress(95, "Generating report...", "report_generation");

      const redCodeSet = new Set(["R", "MU", "NH", "SA", "PRN-R", "MISSED"]);
      const redIssuePattern = /\b(refus|not home|self-admin|self administered|family|unavailable|missed)\b/i;
      const normalizeRedCode = (raw: unknown): string => {
        const input = String(raw || "").toUpperCase().trim();
        if (!input) return "";
        if (input === "F" || input === "FA" || input === "F/A") return "F";
        if (input === "S/A" || input === "S-A") return "SA";
        if (input === "PRNR") return "PRN-R";
        return input;
      };
      const inferRedCodeFromIssue = (issue: string): string => {
        if (/not home/i.test(issue)) return "NH";
        if (/self-admin/i.test(issue)) return "SA";
        if (/family/i.test(issue)) return "F";
        if (/unavailable|out of stock/i.test(issue)) return "MU";
        if (/missed/i.test(issue)) return "MISSED";
        if (/refus/i.test(issue)) return "R";
        return "";
      };

      const verificationKey = (item: VerificationItem) =>
        `${item.careWorkerName}|${item.date}|${item.medicationId || item.medication}|${item.code}`;
      const existingVerificationKeys = new Set(verificationItems.map(verificationKey));

      if (validatedDiscrepancies.length > 0) {
        const filteredDiscrepancies: Discrepancy[] = [];
        for (const discrepancy of validatedDiscrepancies) {
          const normalizedCode = normalizeRedCode(discrepancy.code);
          const inferredCode = normalizedCode || inferRedCodeFromIssue(discrepancy.issue || "");
          const isRedCode = Boolean(inferredCode && redCodeSet.has(inferredCode));
          const isRedIssue = redIssuePattern.test(discrepancy.issue || "");

          if (isRedCode || isRedIssue) {
            const verificationItem: VerificationItem = {
              careWorkerName: discrepancy.careWorkerName || "N.N.",
              date: discrepancy.date || "",
              medication: discrepancy.medication || "",
              medicationId: discrepancy.medicationId || undefined,
              code: inferredCode || normalizedCode || "R",
              note: discrepancy.issue || "Check if this entry is documented appropriately",
            };
            const key = verificationKey(verificationItem);
            if (!existingVerificationKeys.has(key)) {
              verificationItems.push(verificationItem);
              existingVerificationKeys.add(key);
            }
            continue;
          }
          filteredDiscrepancies.push(discrepancy);
        }
        validatedDiscrepancies = filteredDiscrepancies;
      }

      // =====================================================================
      // GROUP REFUSAL DISCREPANCIES INTO MAIN AND PRN CATEGORIES
      // Main Refusals: R, MU, NH, SA codes (non-PRN refusal-related codes)
      // PRN Refusals: PRN-R codes only
      // Other discrepancies: everything else
      // =====================================================================
      const normalizeRefusalCode = (raw: unknown): string => {
        const input = String(raw || "").toUpperCase().trim();
        if (!input) return "";
        if (input === "F" || input === "FA" || input === "F/A") return "F";
        if (input === "S/A" || input === "S-A") return "SA";
        if (input === "PRNR") return "PRN-R";
        return input;
      };

      const REFUSAL_CODES = new Set(["R", "MU", "NH", "SA", "PRN-R", "MISSED"]);
      const refusalEntries: any[] = [];

      allEntries.forEach((entry: any) => {
        const normalizedCode = normalizeRefusalCode(entry.code);
        if (!REFUSAL_CODES.has(normalizedCode)) return;
        refusalEntries.push({
          careWorkerName: entry.careWorker || "N.N.",
          medication: entry.medication,
          medicationId: Number(entry.medicationId) || undefined,
          code: normalizedCode,
          date: entry.date,
          timeSlot: entry.timeSlot || ""
        });
      });

      const mainRefusalDiscrepancies = refusalEntries.filter((d) => d.code !== "PRN-R");
      const prnRefusalDiscrepancies = refusalEntries.filter((d) => d.code === "PRN-R");
      const otherDiscrepancies = validatedDiscrepancies.filter((d: any) => {
        const code = normalizeRefusalCode(d.code);
        return !REFUSAL_CODES.has(code);
      });

      // Group main refusals by care worker + medication
      const mainRefusalGroups = new Map<string, {
        careWorkerName: string;
        medication: string;
        medicationId?: number;
        code: string;
        dates: { date: string; timeSlot: string; code: string }[];
        count: number;
      }>();

      mainRefusalDiscrepancies.forEach((d: any) => {
        const key = `${d.careWorkerName}|${d.medicationId || d.medication}`;
        if (!mainRefusalGroups.has(key)) {
          mainRefusalGroups.set(key, {
            careWorkerName: d.careWorkerName,
            medication: d.medication,
            medicationId: d.medicationId || undefined,
            code: d.code || "",
            dates: [],
            count: 0
          });
        }
        const group = mainRefusalGroups.get(key)!;
        group.dates.push({ date: d.date, timeSlot: d.timeSlot || "", code: d.code || "" });
        group.count++;
      });

      // Group PRN refusals by care worker + medication
      const prnRefusalGroups = new Map<string, {
        careWorkerName: string;
        medication: string;
        medicationId?: number;
        code: string;
        dates: { date: string; timeSlot: string; code: string }[];
        count: number;
      }>();

      prnRefusalDiscrepancies.forEach((d: any) => {
        const key = `${d.careWorkerName}|${d.medicationId || d.medication}`;
        if (!prnRefusalGroups.has(key)) {
          prnRefusalGroups.set(key, {
            careWorkerName: d.careWorkerName,
            medication: d.medication,
            medicationId: d.medicationId || undefined,
            code: d.code || "",
            dates: [],
            count: 0
          });
        }
        const group = prnRefusalGroups.get(key)!;
        group.dates.push({ date: d.date, timeSlot: d.timeSlot || "", code: d.code || "" });
        group.count++;
      });

      // Convert to arrays and sort by count (most refusals first)
      const groupedMainRefusals = Array.from(mainRefusalGroups.values())
        .sort((a, b) => b.count - a.count);
      const groupedPrnRefusals = Array.from(prnRefusalGroups.values())
        .sort((a, b) => b.count - a.count);
      
      // Legacy: keep groupedRefusals as combined for backward compatibility
      const groupedRefusals = [...groupedMainRefusals, ...groupedPrnRefusals];

      // Prioritize non-refusal discrepancies: time gaps and missed doses first
      const prioritizedDiscrepancies = otherDiscrepancies.sort((a, b) => {
        const getPriority = (issue: string) => {
          if (issue.includes("Time gap")) return 1;
          if (issue.includes("Missed")) return 2;
          if (issue.includes("conflict")) return 3;
          return 4;
        };
        return getPriority(a.issue) - getPriority(b.issue);
      });

      // Total counts for display
      const totalMainRefusalCount = mainRefusalDiscrepancies.length;
      const totalPrnRefusalCount = prnRefusalDiscrepancies.length;
      const totalRefusalCount = mainRefusalDiscrepancies.length + prnRefusalDiscrepancies.length;
      const totalOtherDiscrepancyCount = otherDiscrepancies.length;
      
      // Extract office-closed entries (codes without initials, manually closed by office staff)
      const officeClosedEntries = allEntries.filter((e: any) => e.isOfficeClosed).map((e: any) => ({
        medication: e.medication,
        medicationId: Number(e.medicationId) || undefined,
        date: e.date,
        timeSlot: e.timeSlot,
        code: e.code,
        closedByStaff: e.closedByStaff || 'Office Staff',
        closedTime: e.closedTime || ''
      }));
      console.log(`Standard path: Found ${officeClosedEntries.length} office-closed entries`);

      // Extract ALL entries with support level codes (AS/AD/P) for frontend recalculation
      // This allows discrepancies to be regenerated when the user overrides the medication level
      const supportLevelCodes = ['AS', 'AD', 'P'];
      const supportCodeEntries = allEntries
        .filter((e: any) => e.code && supportLevelCodes.includes(e.code.toUpperCase()))
        .map((e: any) => ({
          careWorkerName: e.careWorker || 'Unknown',
          medication: e.medication,
          medicationId: Number(e.medicationId) || undefined,
          date: e.date,
          timeSlot: e.timeSlot,
          code: e.code.toUpperCase()
        }));
      console.log(`Standard path: Found ${supportCodeEntries.length} entries with support level codes (AS/AD/P)`);

      const standardCareWorkerInferenceIndex = buildCareWorkerInferenceIndex(
        allEntries,
        (entry: any) => entry.careWorker || entry.careWorkerInitials || ""
      );
      const allCareWorkersRaw = collectAllCareWorkers(
        allEntries,
        (entry: any) => entry.careWorker || entry.careWorkerInitials || ""
      );

      // =====================================================================
      // BUILD RESPONSE
      // =====================================================================
      const gridEntryMode = gridPrimaryEnabled || gridOverrideUsed;
      const extractionConsensusDescription = gridEntryMode
        ? gridPrimaryEnabled
          ? "Deterministic grid extraction used (primary)"
          : "Grid parser override used due to low AI extraction coverage"
        : consensusStatus === "verified"
          ? `Extraction verified - passes ${consensusDetails.matchingPasses.join(", ")} agreed`
          : `No consensus - using pass ${consensusDetails.fallbackPassUsed} with highest count for safety`;

      const themesAndTrendsSummary = gridEntryMode
        ? `Processed ${allEntries.length} entries across ${medications.length} medications for ${allDates.length} days. Grid parser extraction used; ${originalCount} initial findings -> ${validatedDiscrepancies.length} confirmed discrepancies, ${verificationItems.length} items requiring verification, and ${warnings.length} warnings.`
        : `Processed ${allEntries.length} entries across ${medications.length} medications for ${allDates.length} days. 3-pass Vision consensus validation: ${originalCount} initial findings -> ${validatedDiscrepancies.length} confirmed discrepancies, ${verificationItems.length} items requiring verification, and ${warnings.length} warnings.`;

      const result = {
        serviceUserName: extractedData.serviceUserInitials || "N.N.",
        serviceUserInitials: extractedData.serviceUserInitials || "N.N.",
        serviceUserType: serviceUserType,
        allergies: allergies,
        medicationLevelEvidence: `Code counts (regular meds): AD=${codeCounts.AD}, AS=${codeCounts.AS}, P=${codeCounts.P}. PRN meds: PRN=${prnCodeCounts.PRN}, F=${prnCodeCounts.F}, MU=${prnCodeCounts.MU}, NH=${prnCodeCounts.NH}, R=${prnCodeCounts.R}. Service level: ${serviceUserType.toUpperCase()}.`,
        codeConflictDetected: codeConflictDetected,
        codeConflictDetails: codeConflictDetails,
        auditPeriodStart: allDates[0] || "",
        auditPeriodEnd: allDates[allDates.length - 1] || "",
        warnings: warnings,
        drugInteractions: drugInteractions,
        hasDiscrepancies: validatedDiscrepancies.length > 0,
        discrepancies: prioritizedDiscrepancies,
        groupedRefusals: groupedRefusals,
        groupedMainRefusals: groupedMainRefusals,
        groupedPrnRefusals: groupedPrnRefusals,
        totalRefusalCount: totalRefusalCount,
        totalMainRefusalCount: totalMainRefusalCount,
        totalPrnRefusalCount: totalPrnRefusalCount,
        totalOtherDiscrepancyCount: totalOtherDiscrepancyCount,
        userVerificationItems: verificationItems,
        prnMedications: {
          hasPRN: prnMedIds.size > 0,
          medications: medications.filter((m: any) => m.isPRN).map((m: any) => ({
            name: m.name,
            protocol: "PRN protocol should be in place"
          }))
        },
        officeClosedEntries: officeClosedEntries,
        supportCodeEntries: supportCodeEntries,
        allCareWorkers: allCareWorkersRaw,
        totalEntriesProcessed: allEntries.length,
        totalMedications: medications.length,
        datesAudited: allDates,
        timeSlotsFound: timeSlots,
        extractionMethod: extractionMethod,
        validationPasses: 3,
        validationStatus: validationStatus,
        validationEvidence: validationEvidence,
        initialDiscrepancyCount: originalCount,
        themesAndTrends: themesAndTrendsSummary,
        gapsInKnowledge: validatedDiscrepancies.length > 0 
          ? "Training needed on: " + Array.from(new Set(validatedDiscrepancies.map(d => {
              if (d.issue.includes("refused")) return "documenting refusal reasons";
              if (d.issue.includes("Missing")) return "completing all entries";
              if (d.issue.includes("Time gap")) return "medication timing requirements";
              return "documentation";
            }))).join(", ")
          : "No significant gaps identified.",
        unknownCareWorkerInitials: Array.from(unknownInitials),
        expectedEntriesCount: expectedEntriesCount,
        actualEntriesCount: actualEntriesCount,
        expectedEntryCount: agreedCount,
        countAgreement: countValidationMatch,
        countValidation: {
          medicationCountConsensus: medicationCountConsensus,
          agreedMedicationCount: agreedMedicationCount,
          extractedMedicationCount: extractedMedicationCount,
          agreedCount: agreedCount,
          extractedCount: extractedCount,
          match: countValidationMatch,
          perMedicationExpectedCounts: Object.fromEntries(expectedEntriesPerMedication),
          perMedicationActualCounts: Object.fromEntries(actualEntriesPerMedication)
        },
        extractionConsensus: {
          status: consensusStatus,
          pass1Count: consensusDetails.pass1Count,
          pass2Count: consensusDetails.pass2Count,
          pass3Count: consensusDetails.pass3Count,
          matchingPasses: consensusDetails.matchingPasses,
          fallbackPassUsed: consensusDetails.fallbackPassUsed,
          escalationReason: consensusDetails.escalationReason,
          description: extractionConsensusDescription
        }
      };

      const scrubbedResult = {
        ...result,
        serviceUserName: normalizeInitials(result.serviceUserInitials || result.serviceUserName),
        serviceUserInitials: normalizeInitials(result.serviceUserInitials || result.serviceUserName),
      };
      const rawResult =
        allowSensitiveView && serviceUserFullName
          ? {
              ...result,
              serviceUserName: serviceUserFullName,
              serviceUserInitials: scrubbedResult.serviceUserInitials,
              scrubbedResult,
            }
          : null;

      console.log("DEBUG: Count validation summary -", {
        medicationCountConsensus,
        agreedMedicationCount,
        extractedMedicationCount,
        agreedCount,
        extractedCount,
        countValidationMatch
      });

      // ========================================================================
      // RESOLVE CARE WORKER NAMES BASED ON PRIVACY SETTINGS
      // - If allowSensitiveView=true (admin): show full names from database
      // - Otherwise: show only initials  
      // - "N.N." only when no initials at all (call documentation not completed)
      // ========================================================================
      const resolveNamesInArray = async (items: any[]): Promise<any[]> => {
        if (!items || items.length === 0) return items;
        return await Promise.all(
          items.map(async (item) => {
            if (item.careWorkerName) {
              item.careWorkerName = await resolveCareWorkerName(item.careWorkerName, allowSensitiveView);
            }
            return item;
          })
        );
      };

      // Resolve names in all arrays that contain care worker names
      result.discrepancies = applyCareWorkerInference(result.discrepancies, standardCareWorkerInferenceIndex);
      result.userVerificationItems = applyCareWorkerInference(result.userVerificationItems, standardCareWorkerInferenceIndex);
      result.groupedRefusals = applyCareWorkerInference(result.groupedRefusals, standardCareWorkerInferenceIndex);
      result.groupedMainRefusals = applyCareWorkerInference(result.groupedMainRefusals, standardCareWorkerInferenceIndex);
      result.groupedPrnRefusals = applyCareWorkerInference(result.groupedPrnRefusals, standardCareWorkerInferenceIndex);
      result.supportCodeEntries = applyCareWorkerInference(result.supportCodeEntries, standardCareWorkerInferenceIndex);

      result.discrepancies = await resolveNamesInArray(result.discrepancies);
      result.userVerificationItems = await resolveNamesInArray(result.userVerificationItems);
      result.groupedRefusals = await resolveNamesInArray(result.groupedRefusals);
      result.groupedMainRefusals = await resolveNamesInArray(result.groupedMainRefusals);
      result.groupedPrnRefusals = await resolveNamesInArray(result.groupedPrnRefusals);
      result.officeClosedEntries = await resolveNamesInArray(result.officeClosedEntries);
      result.supportCodeEntries = await resolveNamesInArray(result.supportCodeEntries);
      result.allCareWorkers = await resolveCareWorkerList(result.allCareWorkers || [], allowSensitiveView);

      // Send final result and 100% progress
      sendProgress(100, "Analysis complete!", "complete");
      // Restore PII tokens in the result before sending to client
      const restoredStandardResult = emarPIIVault.restore(rawResult || scrubbedResult);
      emarPIIVault.logAudit('RESTORE', '/api/ai/analyze-emar', aiUserContext.userId, aiUserContext.username);
      sendEvent('result', restoredStandardResult);
      if (progressInterval) clearInterval(progressInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      emarPIIVault.clear();
      return res.end();
      
      } // End of if (!agentExtractionSucceeded) block
      
    } catch (error: any) {
      console.error("EMAR AI Error:", error);
      sendEvent('error', { message: safeErrorMessage(error, "AI analysis failed") });
      if (progressInterval) clearInterval(progressInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      emarPIIVault.clear();
      return res.end();
    }
  });

  const VISIT_MAX_TOKENS = 90000;
  const VISIT_CHARS_PER_TOKEN = 2;

  const estimateTokens = (text: string) => Math.ceil(text.length / VISIT_CHARS_PER_TOKEN);

  const normalizeHeaderKey = (value: unknown) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const VISIT_SERVICE_USER_KEYS = [
    "service user",
    "service user name",
    "customer name",
    "client name",
    "service location name",
    "service location",
    "resident",
    "patient",
  ];
  const VISIT_PLANNED_START_KEYS = [
    "planned start date and time",
    "planned start time",
    "planned start",
  ];
  const VISIT_PLANNED_DURATION_KEYS = [
    "planned duration",
    "scheduled duration",
    "planned time",
  ];
  const VISIT_ACTUAL_START_KEYS = [
    "actual start date and time",
    "actual start time",
    "actual start",
  ];
  const VISIT_ACTUAL_DURATION_KEYS = [
    "actual duration",
    "delivered duration",
    "actual time",
  ];
  const VISIT_SERVICE_REQ_START_KEYS = [
    "service requirement start date and time",
    "service requirement start time",
    "service requirement time",
  ];
  const VISIT_SERVICE_REQ_DURATION_KEYS = [
    "service requirement duration",
  ];
  const VISIT_ACTUAL_WORKER_KEYS = [
    "actual employee name",
    "actual employee",
    "actual worker",
    "actual carer",
    "delivered worker",
  ];
  const VISIT_LOCATION_KEYS = [
    "actual location analysis",
    "planned location analysis",
    "service requirement location analysis",
    "location analysis",
  ];
  const VISIT_NOTES_KEYS = [
    "notes",
    "timesheet notes",
    "service duty notes",
    "service duty timesheet notes",
    "actual booked on notes",
    "actual booked off notes",
  ];

  const findColumnIndex = (headers: string[], keywords: string[]) => {
    if (!headers.length || !keywords.length) return -1;
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (!header) continue;
      if (keywords.some((keyword) => header.includes(keyword))) return i;
    }
    return -1;
  };

  const sanitizeCellValue = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const day = String(value.getDate()).padStart(2, "0");
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const hours = String(value.getHours()).padStart(2, "0");
      const minutes = String(value.getMinutes()).padStart(2, "0");
      return `${day}/${month}@${hours}:${minutes}`.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const parsed = (RawXLSX as any).SSF?.parse_date_code?.(value);
      if (parsed) {
        const day = String(parsed.d ?? parsed.D ?? "").padStart(2, "0");
        const month = String(parsed.m ?? parsed.M ?? "").padStart(2, "0");
        const hours = String(parsed.H ?? parsed.h ?? 0).padStart(2, "0");
        const minutes = String(parsed.M ?? parsed.m ?? 0).padStart(2, "0");
        if (day && month) return `${day}/${month}@${hours}:${minutes}`.trim();
      }
      return String(value);
    }
    const text = String(value).replace(/\s+/g, " ").trim();
    if (!text) return "";
    const lower = text.toLowerCase();
    if (lower === "true" || lower === "yes") return "Y";
    if (lower === "false" || lower === "no") return "N";
    const dateTimeMatch = text.match(/(\d{1,2})[\\/\\-](\d{1,2})[\\/\\-](\d{2,4}).*?(\\d{1,2}:\\d{2})/);
    if (dateTimeMatch) {
      const day = dateTimeMatch[1].padStart(2, "0");
      const month = dateTimeMatch[2].padStart(2, "0");
      return `${day}/${month}@${dateTimeMatch[4]}`;
    }
    const dateMatch = text.match(/(\d{1,2})[\\/\\-](\d{1,2})[\\/\\-](\d{2,4})/);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, "0");
      const month = dateMatch[2].padStart(2, "0");
      return `${day}/${month}`;
    }
    const timeMatch = text.match(/\b\d{1,2}:\d{2}\b/);
    if (timeMatch) return timeMatch[0];
    return text;
  };

  const toInitials = (value: unknown) => {
    const text = sanitizeCellValue(value).replace(/[^A-Za-z\\s,'-]/g, " ").trim();
    if (!text) return "";
    const parts = text.includes(",")
      ? text.split(",").map((part) => part.trim()).filter(Boolean)
      : text.split(/\s+/).filter(Boolean);
    const ordered = parts.length >= 2 && text.includes(",") ? [parts[1], parts[0]] : parts;
    const initials = ordered.map((part) => part[0]?.toUpperCase()).filter(Boolean).join(".");
    return initials ? `${initials}.` : "";
  };

  const toInitialLast = (value: unknown) => {
    const text = sanitizeCellValue(value).replace(/[^A-Za-z\\s,'-]/g, " ").trim();
    if (!text) return "";
    if (text.includes(",")) {
      const [last, first] = text.split(",").map((part) => part.trim());
      if (first && last) return `${first[0].toUpperCase()}.${last}`;
    }
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      return `${first[0].toUpperCase()}.${last}`;
    }
    return text;
  };

  const compactVisitDocument = (documentContent: string) => {
    const raw = String(documentContent || "").trim();
    if (!raw) return { text: "", method: "empty", truncated: false };
    const tokenEstimate = estimateTokens(raw);
    if (tokenEstimate <= VISIT_MAX_TOKENS) {
      return { text: raw, method: "raw", truncated: false };
    }
    console.log(`[Visit Audit] Raw input ${raw.length} chars (~${tokenEstimate} tokens). Compacting...`);

    let workbook;
    try {
      workbook = SafeXLSX.read(raw, { type: "string", cellDates: true });
    } catch {
      const truncated = raw.slice(0, VISIT_MAX_TOKENS * VISIT_CHARS_PER_TOKEN);
      return { text: truncated, method: "raw-truncate", truncated: true };
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = SafeXLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

    if (!data.length) {
      const truncated = raw.slice(0, VISIT_MAX_TOKENS * VISIT_CHARS_PER_TOKEN);
      return { text: truncated, method: "empty-sheet", truncated: true };
    }

    const headers = data[0].map((cell) => normalizeHeaderKey(cell));
    const columns = {
      serviceUser: findColumnIndex(headers, VISIT_SERVICE_USER_KEYS),
      plannedStart: findColumnIndex(headers, VISIT_PLANNED_START_KEYS),
      plannedDuration: findColumnIndex(headers, VISIT_PLANNED_DURATION_KEYS),
      actualStart: findColumnIndex(headers, VISIT_ACTUAL_START_KEYS),
      actualDuration: findColumnIndex(headers, VISIT_ACTUAL_DURATION_KEYS),
      serviceReqStart: findColumnIndex(headers, VISIT_SERVICE_REQ_START_KEYS),
      serviceReqDuration: findColumnIndex(headers, VISIT_SERVICE_REQ_DURATION_KEYS),
      actualWorker: findColumnIndex(headers, VISIT_ACTUAL_WORKER_KEYS),
      location: findColumnIndex(headers, VISIT_LOCATION_KEYS),
      notes: findColumnIndex(headers, VISIT_NOTES_KEYS),
    };

    const buildLines = (includeNotes: boolean) => {
      const baseColumns: Array<{ label: string; value: (row: any[]) => string }> = [];

      if (columns.serviceUser >= 0) {
        baseColumns.push({ label: "SU", value: (row) => toInitials(row[columns.serviceUser]) });
      }
      if (columns.actualWorker >= 0) {
        baseColumns.push({ label: "CWa", value: (row) => toInitialLast(row[columns.actualWorker]) });
      }
      baseColumns.push({
        label: "Date",
        value: (row) => {
          const candidates = [
            columns.actualStart,
            columns.serviceReqStart,
            columns.plannedStart,
          ].filter((index) => index >= 0);
          for (const index of candidates) {
            const value = sanitizeCellValue(row[index]);
            if (value) return value.split("@")[0];
          }
          return "";
        },
      });
      if (columns.serviceReqDuration >= 0 || columns.plannedDuration >= 0) {
        baseColumns.push({
          label: "ExpDur",
          value: (row) => {
            const primary = columns.serviceReqDuration >= 0 ? sanitizeCellValue(row[columns.serviceReqDuration]) : "";
            if (primary) return primary;
            return columns.plannedDuration >= 0 ? sanitizeCellValue(row[columns.plannedDuration]) : "";
          },
        });
      }
      if (columns.actualDuration >= 0) {
        baseColumns.push({ label: "ActDur", value: (row) => sanitizeCellValue(row[columns.actualDuration]) });
      }
      if (columns.location >= 0) {
        baseColumns.push({ label: "Loc", value: (row) => sanitizeCellValue(row[columns.location]) });
      }

      const columnDefs = includeNotes && columns.notes >= 0
        ? [
            ...baseColumns,
            {
              label: "Notes",
              value: (row: any[]) => {
                let value = sanitizeCellValue(row[columns.notes]);
                if (value.length > 80) value = `${value.slice(0, 77)}...`;
                return value;
              },
            },
          ]
        : baseColumns;

      const lines: string[] = [];
      lines.push(`Columns:${columnDefs.map((col) => col.label).join("|")}`);

      for (let i = 1; i < data.length; i++) {
        const row = data[i] || [];
        const values = columnDefs.map((col) => col.value(row));
        const hasContent = values.some((value) => value && String(value).trim().length > 0);
        if (!hasContent) continue;
        lines.push(values.map((value) => value || "").join("|"));
      }
      return lines;
    };

    let compactLines = buildLines(true);
    let method = "compact-with-notes";
    let compact = compactLines.join("\n");

    if (estimateTokens(compact) > VISIT_MAX_TOKENS) {
      compactLines = buildLines(false);
      method = "compact-no-notes";
      compact = compactLines.join("\n");
    }

    const needsChunking = estimateTokens(compact) > VISIT_MAX_TOKENS;
    return { text: compact, method, truncated: false, needsChunking, lines: compactLines };
  };

  const splitVisitContent = (lines: string[], maxTokens: number) => {
    if (lines.length <= 1) return [lines.join("\n")];
    const header = lines[0];
    const chunks: string[] = [];
    let current: string[] = [header];
    let currentTokens = estimateTokens(header);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = estimateTokens(line) + 1;
      if (currentTokens + lineTokens > maxTokens && current.length > 1) {
        chunks.push(current.join("\n"));
        current = [header, line];
        currentTokens = estimateTokens(header) + lineTokens;
      } else {
        current.push(line);
        currentTokens += lineTokens;
      }
    }

    if (current.length > 1) chunks.push(current.join("\n"));
    return chunks.length ? chunks : [lines.join("\n")];
  };

  const parseVisitAuditResult = (content: string) => {
    const parsed = parseJsonFromContent(content);
    if (!parsed) return null;
    if (parsed.discrepancies && Array.isArray(parsed.discrepancies)) {
      parsed.discrepancies = parsed.discrepancies.filter((d: any) => {
        const name = d.careWorkerName?.toLowerCase?.() || '';
        return name && name !== 'n/a' && name !== 'unknown' && name !== 'not applicable' && name.trim() !== '';
      });
    }
    return parsed;
  };

  const parseAuditDate = (value: string) => {
    if (!value) return null;
    const match = value.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = match[3] ? Number(match[3]) : new Date().getFullYear();
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatAuditDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  };

  const mergeVisitAuditResults = (results: any[]) => {
    const combined: any = {
      serviceUserName: "",
      auditPeriodStart: "",
      auditPeriodEnd: "",
      hasDiscrepancies: false,
      careCalls: [],
      discrepancies: [],
      themesAndTrends: "",
      gapsInKnowledge: "",
    };
    const serviceUsers = new Set<string>();
    const themes = new Set<string>();
    const gaps = new Set<string>();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    for (const result of results) {
      if (result?.serviceUserName) serviceUsers.add(String(result.serviceUserName).trim());
      if (Array.isArray(result?.careCalls)) combined.careCalls.push(...result.careCalls);
      if (Array.isArray(result?.discrepancies)) combined.discrepancies.push(...result.discrepancies);
      if (result?.hasDiscrepancies) combined.hasDiscrepancies = true;
      if (result?.themesAndTrends) themes.add(String(result.themesAndTrends).trim());
      if (result?.gapsInKnowledge) gaps.add(String(result.gapsInKnowledge).trim());

      const start = parseAuditDate(result?.auditPeriodStart || "");
      const end = parseAuditDate(result?.auditPeriodEnd || "");
      if (start && (!startDate || start < startDate)) startDate = start;
      if (end && (!endDate || end > endDate)) endDate = end;
    }

    combined.hasDiscrepancies = combined.hasDiscrepancies || combined.discrepancies.length > 0;
    combined.serviceUserName = serviceUsers.size === 1 ? Array.from(serviceUsers)[0] : "Multiple";
    if (startDate) combined.auditPeriodStart = formatAuditDate(startDate);
    if (endDate) combined.auditPeriodEnd = formatAuditDate(endDate);
    if (!combined.auditPeriodStart) combined.auditPeriodStart = results[0]?.auditPeriodStart || "";
    if (!combined.auditPeriodEnd) combined.auditPeriodEnd = results[0]?.auditPeriodEnd || "";
    combined.themesAndTrends = Array.from(themes).filter(Boolean).join(" | ") || "No significant themes identified.";
    combined.gapsInKnowledge = Array.from(gaps).filter(Boolean).join(" | ") || "No significant gaps identified.";
    return combined;
  };

  const parseDurationMinutes = (value: string) => {
    if (!value) return null;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      if (numeric <= 24) return Math.round(numeric * 60);
      if (numeric <= 24 * 60) return Math.round(numeric);
      return Math.round(numeric);
    }
    const timeMatch = value.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
    }
    return null;
  };

  const parseCompactVisitRows = (lines: string[]) => {
    if (!lines.length) return [];
    const headerLine = lines[0];
    if (!headerLine.startsWith("Columns:")) return [];
    const headers = headerLine.replace("Columns:", "").split("|").map((h) => h.trim());
    const rows: Array<Record<string, string>> = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split("|");
      const row: Record<string, string> = {};
      headers.forEach((key, index) => {
        row[key] = values[index] || "";
      });
      rows.push(row);
    }
    return rows;
  };

  const buildDeterministicVisitAudit = (lines: string[]) => {
    const rows = parseCompactVisitRows(lines);
    const careCalls: any[] = [];
    const discrepancies: any[] = [];
    const serviceUsers = new Set<string>();
    const dateValues: Date[] = [];
    let locationIssues = 0;
    let durationIssues = 0;

    const justificationKeywords = [
      "hospital",
      "family",
      "refused",
      "declined",
      "requested",
      "no access",
      "emergency",
      "not home",
      "cancelled",
      "canceled",
      "service user",
      "client",
    ];

    for (const row of rows) {
      const serviceUser = row.SU || "N.N.";
      const careWorker = row.CWa || "N.N.";
      const date = row.Date || "NA";
      const expectedMinutes = parseDurationMinutes(row.ExpDur || "");
      const actualMinutes = parseDurationMinutes(row.ActDur || "");
      const locationValue = (row.Loc || "").toLowerCase();
      const notes = row.Notes || "";

      serviceUsers.add(serviceUser);

      const locationOK = locationValue
        ? ["y", "yes", "within", "compliant", "ok", "true"].some((token) => locationValue.includes(token))
        : true;

      const hasJustification = notes
        ? justificationKeywords.some((keyword) => notes.toLowerCase().includes(keyword))
        : false;

      const percentageStayed = expectedMinutes && actualMinutes
        ? Math.round((actualMinutes / expectedMinutes) * 100)
        : 100;
      const durationOK = expectedMinutes ? percentageStayed >= 70 : true;
      const compliant = locationOK && (durationOK || hasJustification);

      if (date && date.includes("/")) {
        const dateMatch = date.match(/(\d{1,2})\/(\d{1,2})/);
        if (dateMatch) {
          const day = Number(dateMatch[1]);
          const month = Number(dateMatch[2]) - 1;
          const dateObj = new Date(new Date().getFullYear(), month, day);
          if (!Number.isNaN(dateObj.getTime())) dateValues.push(dateObj);
        }
      }

      careCalls.push({
        careWorkerName: careWorker,
        date,
        locationOK,
        expectedTime: expectedMinutes ? `${expectedMinutes}m` : "NA",
        actualTime: actualMinutes ? `${actualMinutes}m` : "NA",
        percentageStayed,
        compliant,
        justification: hasJustification ? "Justified - see notes" : "NA",
        comment: compliant ? "NA" : "Performance discrepancy",
      });

      if (!locationOK && !hasJustification) {
        locationIssues += 1;
        discrepancies.push({
          careWorkerName: careWorker,
          date,
          issue: "Location non-compliant (outside 200m)",
          actions: { performanceNote: true, meeting: "phone", referToManager: false },
        });
      }

      if (!durationOK && !hasJustification) {
        durationIssues += 1;
        discrepancies.push({
          careWorkerName: careWorker,
          date,
          issue: "Stayed less than 70% of expected time",
          actions: { performanceNote: true, meeting: "phone", referToManager: false },
        });
      }
    }

    const auditPeriodStart = dateValues.length
      ? formatAuditDate(new Date(Math.min(...dateValues.map((d) => d.getTime()))))
      : "";
    const auditPeriodEnd = dateValues.length
      ? formatAuditDate(new Date(Math.max(...dateValues.map((d) => d.getTime()))))
      : "";

    const themes: string[] = [];
    if (locationIssues > 0) themes.push(`Location compliance issues: ${locationIssues}`);
    if (durationIssues > 0) themes.push(`Short visits (<70%): ${durationIssues}`);

    const gaps: string[] = [];
    if (durationIssues > 0) gaps.push("Meeting expected visit durations");
    if (locationIssues > 0) gaps.push("Location check compliance");

    return {
      serviceUserName: serviceUsers.size === 1 ? Array.from(serviceUsers)[0] : "Multiple",
      auditPeriodStart,
      auditPeriodEnd,
      hasDiscrepancies: discrepancies.length > 0,
      careCalls,
      discrepancies,
      themesAndTrends: themes.length ? themes.join("; ") : "No significant patterns found.",
      gapsInKnowledge: gaps.length ? gaps.join("; ") : "No significant gaps identified.",
    };
  };

  const normalizeAuditContext = (input: any) => ({
    serviceUserName: typeof input?.serviceUserName === "string" ? input.serviceUserName.trim() : "",
    auditPeriodStart: typeof input?.auditPeriodStart === "string" ? input.auditPeriodStart.trim() : "",
    auditPeriodEnd: typeof input?.auditPeriodEnd === "string" ? input.auditPeriodEnd.trim() : "",
    notes: typeof input?.notes === "string" ? input.notes.trim() : "",
  });

  const normalizeAuditServiceUserName = (name: string, allowSensitiveView: boolean) => {
    const cleaned = String(name || "").trim();
    if (!cleaned) return "";
    if (allowSensitiveView) return normalizeFullName(cleaned) || cleaned;
    return normalizeInitials(cleaned) || toInitials(cleaned) || cleaned;
  };

  const applyAuditHints = (
    result: any,
    hints: ReturnType<typeof normalizeAuditContext>,
    allowSensitiveView: boolean
  ) => {
    if (!result) return result;
    const hintedName = normalizeAuditServiceUserName(hints.serviceUserName, allowSensitiveView);
    if (hintedName && (!result.serviceUserName || result.serviceUserName === "N.N.")) {
      result.serviceUserName = hintedName;
    }
    if (hints.auditPeriodStart && !result.auditPeriodStart) {
      result.auditPeriodStart = hints.auditPeriodStart;
    }
    if (hints.auditPeriodEnd && !result.auditPeriodEnd) {
      result.auditPeriodEnd = hints.auditPeriodEnd;
    }
    return result;
  };

  const enrichVisitResult = (result: any, fallback: any) => {
    if (!result || !fallback) return result;
    if (!Array.isArray(result.careCalls) || result.careCalls.length === 0) {
      result.careCalls = Array.isArray(fallback.careCalls) ? fallback.careCalls : [];
    }
    if (!Array.isArray(result.discrepancies) || result.discrepancies.length === 0) {
      result.discrepancies = Array.isArray(fallback.discrepancies) ? fallback.discrepancies : [];
    }
    if (!result.auditPeriodStart) result.auditPeriodStart = fallback.auditPeriodStart || "";
    if (!result.auditPeriodEnd) result.auditPeriodEnd = fallback.auditPeriodEnd || "";
    if (!result.serviceUserName || result.serviceUserName === "Multiple") {
      result.serviceUserName = fallback.serviceUserName || result.serviceUserName;
    }
    if (!result.themesAndTrends) result.themesAndTrends = fallback.themesAndTrends;
    if (!result.gapsInKnowledge) result.gapsInKnowledge = fallback.gapsInKnowledge;
    result.hasDiscrepancies = Array.isArray(result.discrepancies) && result.discrepancies.length > 0;
    return result;
  };

  // Analyze Visit Notes with SSE streaming progress
  app.post("/api/ai/analyze-visit", requireAuth, async (req, res) => {
    const { documentContent, auditContext } = req.body;
    const visitPIIVault = new PIIVault();
    
    if (!documentContent) {
      return res.status(400).json({ message: "Document content required" });
    }
    if (typeof documentContent === "string") {
      console.log(`[Visit Audit] Incoming content length=${documentContent.length}`);
    }

    // Set up SSE streaming response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.flushHeaders();

    // Heartbeat to keep connection alive
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
        if (typeof (res as any).flush === 'function') (res as any).flush();
      } catch (e) {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    }, 10000);
    
    // Helper to send SSE events with 4KB padding to push through proxy buffers
    const sendEvent = (eventType: string, data: any) => {
      try {
        const padding = `: ${'x'.repeat(4096)}\n\n`;
        const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(padding + payload);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (e) {
        console.error('[Visit SSE] Write error:', e);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    };
    
    // Helper to send progress updates
    const sendProgress = (percent: number, status: string, stage: string) => {
      console.log(`[Visit SSE] Progress: ${percent}% - ${status}`);
      sendEvent('progress', { percent, status, stage });
    };
    
    try {
      // User context for AI cost tracking
      const user = await storage.getUser(req.session.userId!);
      const aiUserContext: AiUserContext = { userId: user?.id || null, username: user?.username || null };
      const allowSensitiveView = user?.role === "admin";
      const auditHints = normalizeAuditContext(auditContext);
      const auditHintsForAi = {
        serviceUserName: auditHints.serviceUserName ? visitPIIVault.scrubString(auditHints.serviceUserName) : "",
        auditPeriodStart: auditHints.auditPeriodStart,
        auditPeriodEnd: auditHints.auditPeriodEnd,
        notes: auditHints.notes ? visitPIIVault.scrubString(auditHints.notes) : "",
      };
      const serviceUserFullName = normalizeFullName(extractServiceUserFullName(documentContent));
      const visitAuditModel = getAccurateModel();
      const visitAuditValidationModel = visitAuditModel;
      
      sendProgress(5, "Preparing visit logs...", "init");

      const preprocessing = compactVisitDocument(documentContent);
      const analysisContent = preprocessing.text;
      if (!analysisContent) {
        sendEvent('error', { message: "Visit log content could not be processed." });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
      console.log(`[Visit Audit] Prepared content length=${analysisContent.length} (~${estimateTokens(analysisContent)} tokens), method=${preprocessing.method}, chunking=${preprocessing.needsChunking}`);
      if (preprocessing.method !== "raw") {
        console.log(`[Visit Audit] Input optimized via ${preprocessing.method} (chunking=${preprocessing.needsChunking})`);
        sendProgress(8, "Optimizing visit log size...", "preprocess");
      }
      if (preprocessing.needsChunking && Array.isArray(preprocessing.lines)) {
        sendProgress(20, "Large dataset detected. Running optimized audit locally...", "local_audit");
        const localResult = applyAuditHints(
          buildDeterministicVisitAudit(preprocessing.lines),
          auditHints,
          allowSensitiveView
        );
        if (allowSensitiveView && serviceUserFullName && localResult.serviceUserName !== "Multiple") {
          localResult.serviceUserName = serviceUserFullName;
        }
        sendProgress(100, "Analysis complete!", "complete");
        sendEvent('result', localResult);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      // Fetch ALL relevant policy documents for visit audits
      const visitPolicies = await storage.getPolicyDocumentsByCategory("visit_audit");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");
      
      // Build policy context from uploaded documents
      let policyContext = "";
      const allPolicies = [...visitPolicies, ...scopeOfPracticePolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY DOCUMENTS - YOU MUST FOLLOW THESE GUIDELINES ===
${visitPolicies.map(p => `
--- VISIT AUDIT POLICY: ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
${scopeOfPracticePolicies.map(p => `
--- SCOPE OF PRACTICE: ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
=== END POLICY DOCUMENTS ===

You MUST apply the rules and guidelines from the policy documents above when analyzing the visit logs. Any discrepancies should be evaluated against these specific policies.

`;
      }

      sendProgress(15, "Analyzing visit records...", "parsing");

      const auditContextBlock = auditHintsForAi.serviceUserName || auditHintsForAi.auditPeriodStart || auditHintsForAi.auditPeriodEnd || auditHintsForAi.notes
        ? `
OPERATOR PROVIDED CONTEXT (USE ONLY TO FILL MISSING DETAILS, NEVER TO INVENT DISCREPANCIES):
- Service user: ${auditHintsForAi.serviceUserName || "Not provided"}
- Audit period start: ${auditHintsForAi.auditPeriodStart || "Not provided"}
- Audit period end: ${auditHintsForAi.auditPeriodEnd || "Not provided"}
- Notes: ${auditHintsForAi.notes || "Not provided"}
`
        : "";

      const systemPrompt = `You are an expert care visit auditor for a UK care facility. Analyze the visit logs and carer notes.

CRITICAL INSTRUCTION - COMPREHENSIVE AUDIT:
You MUST check EVERY SINGLE visit entry in the document against EVERY SINGLE rule listed below. Do NOT sample or skip entries. Do NOT summarize multiple discrepancies into one. Report EACH discrepancy as a SEPARATE entry with its specific date.

There is NO LIMIT to the number of discrepancies - if there are 50 errors, list all 50. If there are 100 errors, list all 100.
${policyContext}
PRIVACY RULES - CRITICAL - MUST FOLLOW:
- For SERVICE USERS: ONLY return their initials (e.g., "K.S." or "J.B."). NEVER return full names or date of birth.
- For CARE WORKERS: Return names in initial.lastname format (e.g., "L.Barron", "M.Smith"). If you only see initials, return those initials.
- Do NOT include any date of birth information for anyone.

FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (—) or en-dashes (–). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

EXTRACT FROM DOCUMENT:
- Service user INITIALS ONLY (e.g., K.S., not full name)
- First and last dates covered in the document

${auditContextBlock}

VALIDATION RULES:
1. LOCATION: Carer must log in at location (less than 200m from service user's address) for the call to be compliant.
2. DURATION: Care call is compliant if carer stayed for ≥70% of expected time. Calculate: (actual / expected) × 100. Round to nearest integer.
3. JUSTIFICATIONS: Visit can still be compliant if notes explain valid reason (service user in hospital, service user requested early departure, service user was not at home and carer left appropriate note, etc.)
4. CONCERNS: Check if notes mention any concerns, incidents, changes in condition, falls, or safeguarding issues — and whether appropriate action was taken or escalated.
5. NOTE QUALITY: Assess if notes are of acceptable professional standard — they should describe what was done (personal care, meals, medication, mobility) not just "all tasks completed".
6. LATE/EARLY ARRIVAL: Flag if carer arrived significantly early or late (>15 minutes from scheduled time) without documented reason.
7. MISSED TASKS: If the care plan specifies tasks (medication, meals, personal care) and notes do not confirm completion, flag as unverified task.
8. UNSIGNED VISITS: If a visit has no carer signature or initials, flag as unverified unless the notes document a valid reason (e.g., emergency contact, relief carer, system error).

Respond ONLY with valid JSON in this exact format:
{
  "serviceUserName": "Service user INITIALS ONLY (e.g., K.S.) - NEVER full name",
  "auditPeriodStart": "DD/MM/YYYY",
  "auditPeriodEnd": "DD/MM/YYYY",
  "hasDiscrepancies": true/false,
  "careCalls": [
    {
      "careWorkerName": "Full Name",
      "date": "DD/MM",
      "locationOK": true/false,
      "expectedTime": "30m",
      "actualTime": "25m",
      "percentageStayed": 83,
      "compliant": true/false,
      "justification": "If not compliant, why it might still be acceptable or NA",
      "comment": "NA" | "Performance discrepancy"
    }
  ],
  "discrepancies": [
    {
      "careWorkerName": "MUST be an actual care worker name found in the document - NEVER use 'N/A', 'Unknown', or empty string",
      "date": "DD/MM",
      "issue": "Description of what went wrong - must be a care worker error",
      "actions": {
        "performanceNote": true,
        "meeting": "none" | "phone" | "in_person",
        "referToManager": false
      }
    }
  ],
  "themesAndTrends": "Summary of common patterns found",
  "gapsInKnowledge": "Areas where training is needed"
}`;

      // Fixed seed ensures deterministic output - running same input gives same results
      const DETERMINISTIC_SEED = 42;
      
      const chunkTokenLimit = Math.min(VISIT_MAX_TOKENS, 90000);
      const chunks = preprocessing.needsChunking && Array.isArray(preprocessing.lines)
        ? splitVisitContent(preprocessing.lines, chunkTokenLimit)
        : [analysisContent];

      if (chunks.length > 1) {
        sendProgress(20, `Large document detected. Processing ${chunks.length} batches...`, "chunking");
      }

      // Simulated progress during AI analysis
      let simulatedProgress = 20;
      progressInterval = setInterval(() => {
        if (simulatedProgress < 45) {
          simulatedProgress += 3;
          const messages = [
            "Analyzing visit log entries...",
            "Checking attendance compliance...",
            "Reviewing care notes quality...",
            "Identifying discrepancies...",
            "Processing visit patterns...",
          ];
          const msgIndex = Math.floor((simulatedProgress - 20) / 5) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "ai_analysis");
        }
      }, 3000);

      // Scrub PII from all chunks before sending to AI
      const scrubbedChunks = chunks.map(chunk => visitPIIVault.scrubString(chunk));
      visitPIIVault.logAudit('SCRUB', '/api/ai/analyze-visit', aiUserContext.userId, aiUserContext.username);

      const chunkResults: any[] = [];
      for (let i = 0; i < scrubbedChunks.length; i++) {
        const label = scrubbedChunks.length > 1 ? ` (${i + 1}/${scrubbedChunks.length})` : "";
        sendProgress(30, `Running AI analysis${label}...`, "ai_analysis");

        const response = await executeSecureTextCompletion({
          endpoint: "/api/ai/analyze-visit",
          feature: "visit_audit",
          model: visitAuditModel,
          userContext: aiUserContext,
          inputText: `Analyze these visit logs:\n\n${scrubbedChunks[i]}`,
          systemPrompt,
          maxCompletionTokens: 4000,
          temperature: 0,
          seed: DETERMINISTIC_SEED,
          responseFormat: { type: "json_object" },
          useCache: false,
        });

        const content = response.restoredText || "";
        const parsed = parseVisitAuditResult(content);
        if (parsed) {
          chunkResults.push(parsed);
        } else {
          const hasBrace = content.includes("{");
          console.warn(`[Visit Audit] Chunk ${i + 1} returned unparsable JSON output (length=${content.length}, hasBrace=${hasBrace}).`);
        }
      }

      if (progressInterval) clearInterval(progressInterval);

      if (chunkResults.length === 0) {
        throw new Error("No result received from analysis");
      }

      const result = chunkResults.length === 1
        ? chunkResults[0]
        : mergeVisitAuditResults(chunkResults);

      if (preprocessing.lines && (result?.careCalls?.length || 0) === 0) {
        const fallbackResult = buildDeterministicVisitAudit(preprocessing.lines);
        enrichVisitResult(result, fallbackResult);
      }

      applyAuditHints(result, auditHints, allowSensitiveView);

      sendProgress(50, "Processing initial results...", "parsing_results");
        
        // =====================================================================
        // TRIPLE-CHECK VALIDATION FOR VISIT AUDIT
        // FAIL-SAFE: If validation fails, KEEP original discrepancies
        // =====================================================================
        const originalCount = result.discrepancies?.length || 0;
        let validatedDiscrepancies = [...(result.discrepancies || [])];
        let validationEvidence: Record<string, string> = {};
        let validationStatus = "not_run";
        
        if (validatedDiscrepancies.length > 0) {
          sendProgress(55, `Validating ${validatedDiscrepancies.length} discrepancies...`, "validation_start");
          console.log(`DEBUG Visit Audit: Starting triple-check on ${validatedDiscrepancies.length} discrepancies`);
          
          // Use more document context - scrub PII before sending to validation AI
          const docContext = visitPIIVault.scrubString(analysisContent.substring(0, 30000));
          
          // PASS 2: Review for false positives - BE CONSERVATIVE
          const pass2Prompt = `You are a quality assurance reviewer for care visit audits. Review these detected discrepancies and filter out ONLY OBVIOUS FALSE POSITIVES.

ORIGINAL VISIT LOGS:
${docContext}

DETECTED DISCREPANCIES:
${validatedDiscrepancies.map((d: any, i: number) => `[${i + 1}] ${d.date} - ${d.careWorkerName} - ${d.issue}`).join("\n")}

REVIEW CRITERIA - BE CONSERVATIVE:
1. ONLY mark as INVALID if you are 100% certain it's a false positive
2. If in doubt, mark as VALID to preserve the finding
3. A justified early departure is STILL a discrepancy to document
4. Location issues are real even if the visit happened

IMPORTANT: It is better to keep a potential false positive than to remove a real discrepancy.

Return JSON with indices that are VALID. Include ALL unless you're CERTAIN one is false:
{"validIndices": [1, 2, 3, 4, 5]}`;

          let pass2Success = false;
          try {
            sendProgress(65, "Running validation pass 2...", "validation_pass2");
            // Use visit-audit validation model for deterministic validation
            const pass2Response = await executeSecureTextCompletion({
              endpoint: "/api/ai/analyze-visit",
              feature: "visit_audit_validation_pass2",
              model: visitAuditValidationModel,
              userContext: aiUserContext,
              inputText: "Review discrepancies. Be conservative - when in doubt, keep.",
              systemPrompt: pass2Prompt,
              maxCompletionTokens: 2000,
              temperature: 0,
              seed: DETERMINISTIC_SEED,
              responseFormat: { type: "json_object" },
              useCache: false,
            });
            
            const pass2Content = pass2Response.restoredText || "";
            const pass2Match = pass2Content.match(/\{[\s\S]*\}/);
            
            if (pass2Match) {
              const pass2Data = JSON.parse(pass2Match[0]);
              const validIndices = pass2Data.validIndices;
              
              if (Array.isArray(validIndices) && validIndices.length > 0) {
                const validSet = new Set(validIndices);
                validatedDiscrepancies = validatedDiscrepancies.filter((_: any, i: number) => validSet.has(i + 1));
                pass2Success = true;
                console.log(`DEBUG Visit Audit: Pass 2 - ${originalCount} -> ${validatedDiscrepancies.length}`);
              } else {
                console.log(`DEBUG Visit Audit: Pass 2 empty validIndices - keeping all`);
              }
            }
          } catch (e) {
            console.error("Visit Pass 2 error:", e);
          }
          
          // PASS 3: Final confirmation with evidence
          if (validatedDiscrepancies.length > 0) {
            const pass3Prompt = `FINAL quality check for visit audit discrepancies.

DOCUMENT:
${docContext}

DISCREPANCIES TO CONFIRM:
${validatedDiscrepancies.map((d: any, i: number) => `[${i + 1}] ${d.date} - ${d.careWorkerName} - ${d.issue}`).join("\n")}

For EACH discrepancy, provide evidence if found. Do NOT remove just because text evidence is unclear.

Return JSON - include ALL by default:
{
  "confirmedIndices": [1, 2, 3],
  "evidence": {"1": "15 min visit logged", "2": "Detection appears valid"}
}`;

            try {
              sendProgress(80, "Running validation pass 3...", "validation_pass3");
              // Use visit-audit validation model for deterministic validation
              const pass3Response = await executeSecureTextCompletion({
                endpoint: "/api/ai/analyze-visit",
                feature: "visit_audit_validation_pass3",
                model: visitAuditValidationModel,
                userContext: aiUserContext,
                inputText: "Confirm and provide evidence. Keep discrepancies even without explicit text.",
                systemPrompt: pass3Prompt,
                maxCompletionTokens: 2000,
                temperature: 0,
                seed: DETERMINISTIC_SEED,
                responseFormat: { type: "json_object" },
                useCache: false,
              });
              
              const pass3Content = pass3Response.restoredText || "";
              const pass3Match = pass3Content.match(/\{[\s\S]*\}/);
              
              if (pass3Match) {
                const pass3Data = JSON.parse(pass3Match[0]);
                const confirmedIndices = pass3Data.confirmedIndices;
                
                if (Array.isArray(confirmedIndices) && confirmedIndices.length > 0) {
                  const confirmedSet = new Set(confirmedIndices);
                  validatedDiscrepancies = validatedDiscrepancies.filter((_: any, i: number) => confirmedSet.has(i + 1));
                  
                  if (pass3Data.evidence) {
                    validationEvidence = pass3Data.evidence;
                  }
                  validationStatus = "completed";
                  console.log(`DEBUG Visit Audit: Pass 3 - final count: ${validatedDiscrepancies.length}`);
                } else {
                  validationStatus = "partial";
                  console.log(`DEBUG Visit Audit: Pass 3 empty confirmedIndices - keeping all`);
                }
              }
            } catch (e) {
              console.error("Visit Pass 3 error:", e);
              validationStatus = pass2Success ? "partial" : "failed";
            }
          } else {
            validationStatus = pass2Success ? "completed" : "failed";
          }
        }
        
        console.log(`DEBUG Visit Audit: Triple-check complete - ${originalCount} initial -> ${validatedDiscrepancies.length} confirmed (status: ${validationStatus})`);
        
        result.discrepancies = validatedDiscrepancies.map((disc: any, index: number) => ({
          ...disc,
          evidence: validationEvidence[String(index + 1)] || validationEvidence[index + 1],
        }));
        result.hasDiscrepancies = validatedDiscrepancies.length > 0;
        result.validationPasses = 3;
        result.validationStatus = validationStatus;
        result.validationEvidence = validationEvidence;
        result.initialDiscrepancyCount = originalCount;
        
        sendProgress(100, "Analysis complete!", "complete");
        // Restore any PII tokens in the result before sending to client
        const restoredResult = visitPIIVault.restore(result);
        if (allowSensitiveView && serviceUserFullName && restoredResult.serviceUserName !== "Multiple") {
          restoredResult.serviceUserName = serviceUserFullName;
        }
        visitPIIVault.logAudit('RESTORE', '/api/ai/analyze-visit', aiUserContext.userId, aiUserContext.username);
        sendEvent('result', restoredResult);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        visitPIIVault.clear();
        return res.end();
    } catch (error: any) {
      console.error("Visit AI Error:", error);
      sendEvent('error', { message: safeErrorMessage(error, "AI analysis failed") });
      if (progressInterval) clearInterval(progressInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      visitPIIVault.clear();
      return res.end();
    }
  });

  // Analyze documents for risk assessment
  app.post("/api/ai/analyze-risks", requireAuth, async (req: any, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    // PII Vault for reversible scrubbing - keeps sensitive data local
    const piiVault = new PIIVault();
    
    try {
      const { documentContent, allowSensitive } = req.body;
      const allowSensitiveView = Boolean(allowSensitive) && req.user?.role === "admin";
      
      if (typeof documentContent !== "string" || !documentContent.trim()) {
        return res.status(400).json({ message: "Document content required" });
      }
      
      // Scrub PII using vault - original values stored locally for restoration
      // When allowSensitiveView is true, we still scrub for AI but restore for display
      const documentContentForAi = piiVault.scrub(documentContent);
      const vaultStats = piiVault.getStats();
      console.log(`[Risks] PII Vault: Scrubbed ${vaultStats.total} sensitive items (${Object.entries(vaultStats.byCategory).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(', ')})`);
      
      // Security audit log for compliance
      piiVault.logAudit('SCRUB', '/api/ai/analyze-risks', aiUserContext.userId, aiUserContext.username);

      // Set up SSE for progress streaming with production-safe settings
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const corsOrigin = process.env.CORS_ORIGIN;
      if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.flushHeaders();

      // Small delay to ensure headers are flushed through proxies
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send initial ping to establish connection
      res.write(`: ping\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();

      // Heartbeat to keep connection alive during long AI processing
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 10000);

      const sendEvent = (eventType: string, data: any) => {
        try {
          const padding = `: ${'x'.repeat(4096)}\n\n`;
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          res.write(padding + payload);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        } catch (e) {
          console.error('[Risks SSE] Write error:', e);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      const sendProgress = (percent: number, status: string, stage: string) => {
        console.log(`[Risks SSE] Progress: ${percent}% - ${status}`);
        sendEvent('progress', { percent, status, stage });
      };

      if (!isAIEnabled()) {
        sendProgress(15, "Running secure rule-based analysis...", "rule_based");
        const fallbackResult = buildRuleBasedRiskAnalysisPayload(documentContentForAi, allowSensitiveView);
        const templateResult = piiVault.toPlaceholders(fallbackResult);
        // Always export vault for automatic name restoration
        const vaultExport = piiVault.export();
        const payload = {
          ...templateResult,
          vaultExport,
          rawWithTokens: fallbackResult,
        };
        piiVault.logAudit('RESTORE', '/api/ai/analyze-risks', aiUserContext.userId, aiUserContext.username);
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', payload);
        piiVault.clear();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      sendProgress(5, "Initializing risk assessment...", "init");
      await new Promise(resolve => setTimeout(resolve, 150)); // Give client time to process
      sendProgress(10, "Loading policy documents...", "loading_policies");

      // Fetch ALL policy documents for comprehensive risk assessment
      const initialAssessmentPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      const riskAssessmentPolicies = await storage.getPolicyDocumentsByCategory("risk_assessment");
      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");
      
      const allPolicies = [...initialAssessmentPolicies, ...riskAssessmentPolicies, ...carePlanPolicies, ...scopeOfPracticePolicies];
      const policyFingerprint = createHash("sha256")
        .update(allPolicies.map((policy) => `${policy.name || "policy"}|${policy.version || "v1.0"}|${policy.content || ""}`).join("||"))
        .digest("hex");

      const cacheKey = createHash("sha256")
        .update(documentContentForAi || "")
        .update("|")
        .update(policyFingerprint)
        .update("|")
        .update("evidence_v4")
        .update("|")
        .update(allowSensitiveView ? "1" : "0")
        .digest("hex");

      const cachedPayload = getRiskAnalysisCache(cacheKey);
      if (cachedPayload) {
        // Cache stores placeholder-only output to avoid persisting PII across requests.
        // Do not return rawWithTokens on cache hits because tokens would not match this request's vault.
        const fullPayload = {
          ...cachedPayload,
          _cached: true,
        };
        sendProgress(65, "Loaded cached analysis...", "cache");
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', fullPayload);
        piiVault.clear();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      // Build policy context from uploaded documents
      let policyContext = "";
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY/TEMPLATE DOCUMENTS - FOR STRUCTURE REFERENCE ONLY ===

⚠️ CRITICAL WARNING: The documents below are TEMPLATES/EXAMPLES containing PLACEHOLDER and EXAMPLE text.
⚠️ DO NOT extract ANY information from these templates as if it were real service user data.
⚠️ These templates show you the STRUCTURE and FORMAT to follow, but contain NO actual service user information.
⚠️ Any text in these templates (medical conditions, care needs, risks, etc.) is EXAMPLE TEXT ONLY - IGNORE IT.
⚠️ ONLY extract information from the "Documents to analyze:" section below, which contains REAL service user documents.

${initialAssessmentPolicies.map(p => `
--- INITIAL ASSESSMENT TEMPLATE (STRUCTURE REFERENCE ONLY): ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
${riskAssessmentPolicies.map(p => `
--- RISK ASSESSMENT TEMPLATE (STRUCTURE REFERENCE ONLY): ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
${carePlanPolicies.map(p => `
--- CARE PLAN TEMPLATE (STRUCTURE REFERENCE ONLY): ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
${scopeOfPracticePolicies.map(p => `
--- SCOPE OF PRACTICE (STRUCTURE REFERENCE ONLY): ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
=== END POLICY/TEMPLATE DOCUMENTS ===

CRITICAL REMINDER:
- Templates above are for STRUCTURE/FORMAT reference only
- DO NOT use any content from templates as service user information
- ONLY extract information from the actual service user documents below

`;
      }

      const privacyRules = allowSensitiveView
        ? `5. Personal data has been tokenized (e.g. {{PII_...}}). Keep these tokens in your output - they will be converted to readable placeholders like [Name].
6. Keep place names and locations as written. Do not redact places.
7. Never try to guess real names or dates of birth from tokens.`
        : `5. Personal data has been tokenized. Keep tokens in output - they become [Name], [NHS Number] etc.
6. Keep place names and locations as written. Do not redact places.`;

      const serviceUserExtractionRules = allowSensitiveView
        ? `- Service user full name if present in the documents (first and last name). Do not invent names. Do NOT use placeholder words like "Name", "First Name", "Last Name", "Unknown" etc. - only use the actual person's real name or return "Information not found in documents".
- Service user initials ONLY (format: "F.O." - first letter of first name + "." + first letter of last name + ".")`
        : `- Service user initials ONLY (format: "F.O." - first letter of first name + "." + first letter of last name + ".")`;

      const serviceUserJsonSchema = allowSensitiveView
        ? `"serviceUser": {
    "fullName": "The person's actual real name as written in documents (NOT placeholder text like 'Name' or 'First Name Last Name') or 'Information not found in documents' if no real name found",
    "initials": "Initials in format F.O. (first initial + dot + last initial + dot) or 'N.N.' if not found"
  },`
        : `"serviceUser": {
    "initials": "Initials in format F.O. (first initial + dot + last initial + dot) or 'N.N.' if not found"
  },`;

      const systemPrompt = `You are an expert care assessor following CQC 2024 standards and NHS England principles for risk assessment.

═══════════════════════════════════════════════════════════════════════════════
NHS ENGLAND 12 PRINCIPLES FOR RISK ASSESSMENT (2024)
═══════════════════════════════════════════════════════════════════════════════

1. PERSON-CENTRED: "Actively focus on the experience of people using services"
   → Only recommend assessments that address the individual's documented needs
   → Consider their unique circumstances, preferences and concerns
   
2. COLLABORATIVE: Work with information from multiple sources (family, professionals)
   
3. INTELLIGENCE SHARING: Use all available documented information
   → Look for multiple evidence sources: medical records, care notes, incident reports
   → Recent information is more relevant than old information
   
4. COMMON LANGUAGE: Use clear, consistent terminology
   → Use specific terms not vague descriptions
   
5. CLEAR ROLES & RESPONSIBILITIES: Identify who needs to act on each risk
   → Each assessment must have actionable steps for care workers
   
6. RECORDING & MONITORING: Ensure risks are documented with evidence
   
7. ACTION PLANNING: Each assessment must lead to actionable care plans
   
8. ESCALATION: Know when to escalate to registered professionals
   
9. COMPETENT DECISION-MAKING: Stay within care worker scope of practice
   
10. EQUALITIES & INEQUALITIES: Consider individual circumstances
   
11. EXTERNAL FACTORS: Consider home environment, social factors
   
12. DYNAMIC REVIEW: Risk assessment is ongoing, based on changing needs

═══════════════════════════════════════════════════════════════════════════════
CQC 2024 STANDARDS: PERSON-CENTRED CARE
═══════════════════════════════════════════════════════════════════════════════

"Care must be individualised and meet each person's unique preferences and needs"

✓ Base recommendations ONLY on documented evidence about THIS service user
✓ Risk management must protect from harm while promoting independence
✓ Regular assessments should identify specific, documented hazards
✓ Restrictive practice is a FAILURE of person-centred planning

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK: BUILD A PERSON-CENTRED RISK PROFILE
═══════════════════════════════════════════════════════════════════════════════

1. SCAN ALL SERVICE USER DOCUMENTS (in "Documents to analyze:" section) THOROUGHLY
2. Extract ONLY information EXPLICITLY documented about THIS service user
3. Recommend assessments ONLY when you have STRONG DOCUMENTED EVIDENCE

${policyContext}
FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (—) or en-dashes (–). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

⚠️ CRITICAL: DOCUMENT SOURCE SEPARATION ⚠️
1. Template/policy documents above are for STRUCTURE REFERENCE ONLY - they contain example/placeholder text
2. REAL service user information is ONLY in the "Documents to analyze:" section below
3. DO NOT extract medical conditions, care needs, or risks from templates - they are examples only
4. DO NOT confuse template questions/prompts with actual service user information

═══════════════════════════════════════════════════════════════════════════════
EVIDENCE-BASED ANALYSIS - NHS ENGLAND STANDARDS
═══════════════════════════════════════════════════════════════════════════════

CRITICAL REQUIREMENTS FOR EVIDENCE:

1. ONLY DOCUMENTED FACTS: Extract information EXPLICITLY stated in SERVICE USER documents
   ✗ DO NOT make assumptions or infer conditions not mentioned
   ✗ DO NOT extract from template/policy documents (they contain placeholder text)
   ✓ DO extract from "Documents to analyze:" section ONLY

2. SIGNIFICANT EVIDENCE REQUIRED: Each recommended assessment needs SUBSTANTIAL documented evidence
   ✗ DO NOT recommend based on vague mentions or single keywords
   ✗ DO NOT recommend "just in case" or for speculation
   ✓ DO recommend when multiple pieces of evidence support the need
   ✓ DO recommend when the risk is clearly documented and significant

3. PERSON-CENTRED APPROACH (CQC 2024 Principle #1):
   ✗ DO NOT recommend generic "everyone needs this" assessments
   ✗ DO NOT apply blanket rules or assumptions
   ✓ DO tailor recommendations to THIS individual's documented needs
   ✓ DO explain the specific relevance to THIS service user

4. EVIDENCE TRACEABILITY:
   ✓ Every assessment MUST cite specific text from SERVICE USER documents
   ✓ Include 2-6 short direct quotes supporting each recommendation
   ✓ If no specific evidence → DO NOT recommend the assessment

5. SELECTIVE APPROACH - ONLY STRONG EVIDENCE ASSESSMENTS:
   ✓ Each assessment needs MULTIPLE pieces of SPECIFIC documented evidence (2+ diverse quotes)
   ✓ Evidence must contain concrete details: names, dates, equipment, conditions, incidents
   ✓ Evidence diversity required: prefer varied sources (medical + behavioral + environmental)
   ✓ Recent evidence weighted higher: incidents in past month > incidents from years ago
   ✓ TYPICAL RESULT: 3-7 assessments for most service users (only more if extensive risks documented)
   ✓ Quality over quantity - 5 strong assessments better than 15 weak ones
   ✓ Avoid duplicates: don't recommend "Falls" AND "Mobility" if evidence overlaps >70%
   ✓ If evidence is vague/generic (e.g., "may need support", "requires assessment") → DO NOT recommend
   ✓ If in doubt about evidence quality, diversity or specificity → DO NOT recommend

6. ACCURACY IS PARAMOUNT (CQC 2024 Standard):
   ✗ DO NOT make up conditions, incidents, falls, behaviors not mentioned
   ✗ DO NOT assume risks based on age, gender or generalizations
   ✓ DO state "Information not found in documents" if evidence is lacking

═══════════════════════════════════════════════════════════════════════════════
SCOPE OF PRACTICE - CARE WORKER BOUNDARIES
═══════════════════════════════════════════════════════════════════════════════

✓ WITHIN SCOPE: Observations, assistance with activities of daily living, following care plans
✗ OUT OF SCOPE: Diagnosis, prescribing, changing medication doses, clinical decisions

All recommendations must remain within a care worker's scope of practice.

PERSON-CENTRED VOICE AND DETAIL:
- Use first person throughout narrative fields ("I", "my", "me")
- In recommendedAssessments.reason use 2-4 sentences describing impact on my daily life, what matters to me and how I prefer support to be delivered
- documentSummary should be 3-5 sentences in first person, covering routines, preferences and emotional needs if documented

${privacyRules}

═══════════════════════════════════════════════════════════════════════════════
STEP 1: BUILD SERVICE USER PROFILE (From "Documents to analyze:" section ONLY)
═══════════════════════════════════════════════════════════════════════════════

Extract ONLY what is EXPLICITLY documented:

${serviceUserExtractionRules}
- ALL medical conditions mentioned (diabetes, epilepsy, stroke, dementia, heart conditions, respiratory issues, arthritis, Parkinson's, etc.)
- ALL care activities we assist with (feeding, medication, mobility, personal care, cooking, laundry, shopping, etc.)
- ALL documented concerns or risks (falls history, skin issues, behavioral concerns, weight loss, choking risk, pressure sores, wandering, etc.)
- Equipment mentioned (wheelchair, hoist, walking frame, pressure cushion, hospital bed, etc.)
- Communication needs (hearing, visual, speech difficulties, language barriers, etc.)
- Mental capacity considerations
- Environmental factors (stairs, pets, access issues, lone working needed, etc.)

PRIVACY (TOKENIZED DATA):
Personal data has been replaced with tokens like {{PII_..._NAME_1}}. These will be converted to placeholders like [Name], [NHS Number] in the final output.
- Keep all tokens in your response - do not try to guess or invent real values
- Extract initials if visible, but tokens are fine in recommendations

═══════════════════════════════════════════════════════════════════════════════
STEP 2: RECOMMEND RISK ASSESSMENTS (ONLY WITH STRONG DOCUMENTED EVIDENCE)
═══════════════════════════════════════════════════════════════════════════════

POTENTIAL RISK AREAS TO CONSIDER (Recommend ONLY if documented evidence exists for THIS service user):

IDENTITY & COMMUNICATION:
Personal identity and emergency contact details, Communication needs, Language and interpreter needs, Hearing impairment, Vision impairment, Literacy support, Cognitive impairment, Capacity and decision making, Fluctuating capacity, Memory loss, Disorientation, Delirium risk, Dementia related risks, Learning disability support, Autism related needs

MENTAL HEALTH & WELLBEING:
Mental health and wellbeing, Depression indicators, Anxiety indicators, Sleep disturbance, Social isolation, Loneliness impact, Motivation and engagement, Self neglect indicators

PERSONAL CARE & HYGIENE:
Personal hygiene support, Bathing safety, Showering safety, Water temperature scald risk, Dressing and undressing, Grooming and shaving safety, Oral health and denture care, Menstrual care needs

SKIN & TISSUE INTEGRITY:
Skin integrity, Pressure ulcer risk, Skin tears risk, Wound care needs, Wound healing concerns

INFECTION CONTROL:
Infection risk, Hand hygiene facilities, PPE suitability for tasks, Waste disposal practice, Laundry handling, Cross contamination in kitchen, Outbreak management readiness, Vaccination status awareness

NUTRITION & HYDRATION:
Nutrition, Hydration, Food shopping access, Food preparation safety, Food hygiene and storage, Texture modified diets, Choking risk, Aspiration risk, Allergies and intolerances, Religious or cultural diets, Unplanned weight loss, Specialist nutrition support, Alcohol use impact

MOBILITY & FALLS:
Mobility, Falls history, Falls prevention plan, Transfer safety, Bed mobility, Chair and seating safety, Walking aids suitability, Wheelchair safety, Outdoor mobility, Fatigue related falls, Orthostatic hypotension, Dizziness or syncope, Footwear suitability, Orthotics and prosthetics

CONTINENCE:
Continence, Toileting access, Nocturia and night toileting, Urinary incontinence, Faecal incontinence, Constipation, Diarrhoea, Catheter care, Stoma care

MEDICATION MANAGEMENT:
Medication management, Time critical medications, PRN guidance, Controlled drugs security, Covert medication governance, Anticoagulant risks, Insulin administration, Inhaler and nebuliser use, Oxygen therapy safety, Swallowing tablets, Side effects monitoring, Antibiotic course adherence, MAR and recording accuracy

LONG TERM CONDITIONS:
Heart failure deterioration, COPD exacerbation, Asthma control, Diabetes control, Hypoglycaemia risk, Hyperglycaemia risk, Stroke recognition, Seizure management, Sepsis recognition, Pain management, Temperature and fever monitoring, Deconditioning risk, Post hospital discharge risks

END OF LIFE:
Palliative care needs, Advance wishes awareness, DNACPR and TEP awareness

HOME ENVIRONMENT:
Home layout, Lighting levels, Flooring and rugs, Clutter and hoarding, Furniture stability, Bed height and placement, Chair height and stability, Staircases and handrails, Grab rails and bathroom aids, Wet room or bath safety, Kitchen layout and reach, Air quality and ventilation, Temperature regulation in the home, Damp and mold exposure

FIRE & ELECTRICAL SAFETY:
Electrical safety, Gas safety, Carbon monoxide risk, Smoke alarm presence, Fire escape routes, Fire plan and drills, Cooking safety, Heaters and open flames, Flammable emollients near heat, Candle use, Smoking safety, Oxygen near ignition sources

ACCESS & SECURITY:
External access and steps, Garden paths and paving, Weather related access risks, Key safe access, Door and window security, Bogus caller risk, Neighbourhood safety, Visitor management in the home

ANIMALS & ENVIRONMENT:
Pets and animal hazards, Pest and vermin control

SAFEGUARDING:
Boundaries with informal carers, Financial exploitation risk, Domestic abuse indicators, Lone working visit safety for helpers

⚠️ CRITICAL RULES FOR ASSESSMENT RECOMMENDATIONS:

1. SELECT WISELY: Only recommend risks where THIS service user has STRONG documented evidence (not generic "everyone needs this")
2. EVIDENCE REQUIRED: Each recommendation needs MULTIPLE concrete documented facts (2+ diverse quotes)
3. BE SPECIFIC: Tie each risk to documented conditions, incidents, equipment, behaviors, or environmental factors
4. QUALITY > QUANTITY: Better to recommend 3-7 strong evidence-based assessments than 15 weak ones
5. NO MANDATORY FLAGS: "isMandatory": false for ALL assessments (CQC 2024 person-centred principle)
6. IF INSUFFICIENT EVIDENCE → DO NOT RECOMMEND THE ASSESSMENT

EXAMPLE OF STRONG EVIDENCE:
✓ Falls Prevention: "Fell in bathroom Jan 2026 requiring A&E" + "Uses walking frame due to arthritis" + "Unsteady on stairs"
✓ Diabetes Management: "Type 2 diabetes diagnosed 2020" + "Takes metformin 500mg twice daily" + "Blood sugar monitoring required"

EXAMPLE OF WEAK EVIDENCE (DO NOT RECOMMEND):
✗ Mobility: "May need support with walking" (too vague)
✗ Nutrition: "Requires appropriate diet" (circular reasoning, no specifics)

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON ONLY)
═══════════════════════════════════════════════════════════════════════════════

Respond ONLY with valid JSON in this exact format:
{
  ${serviceUserJsonSchema}
  "medicalConditions": ["List ALL conditions explicitly documented - NO assumptions"],
  "careActivities": ["List ALL care activities we provide per documents - be thorough"],
  "concerns": ["List ALL concerns or risks explicitly identified in documents"],
  "equipment": ["List equipment mentioned: wheelchair, hoist, walking frame, etc."],
  "communicationNeeds": ["List communication needs: hearing, vision, speech, language"],
  "environmentalFactors": ["List home/environmental factors: stairs, pets, access, lone working"],
  "recommendedAssessments": [
    {
      "name": "Assessment category name",
      "isMandatory": false,
      "reason": "FIRST PERSON explanation - why I need this assessment based on my documented needs. Start with 'I' or 'My'",
      "evidence": "Specific, detailed summary citing concrete facts from documents (NOT generic phrases like 'requires assessment')",
      "evidenceSnippets": [
        "Direct quote 1 from documents showing specific risk/need",
        "Direct quote 2 from documents with concrete details",
        "MINIMUM 2 quotes required - must be SPECIFIC not vague"
      ]
    }
  ],
  "documentSummary": "Brief first-person summary of my overall profile based on ALL documents scanned - use 'I' and 'my'"
}

EVIDENCE QUALITY REQUIREMENTS - CRITICAL:

✓ STRONG EVIDENCE (Include assessment):
  - "Has fallen twice in the past month, once in bathroom" (specific incidents, dates, location)
  - "Diagnosed with Type 2 diabetes, takes metformin 500mg twice daily" (diagnosis + medication)
  - "Uses a zimmer frame but struggles on stairs due to arthritis" (equipment + limitation + reason)
  - "Has a pressure sore on left heel, grade 2, being treated by district nurse" (specific location, stage, treatment)
  - "Becomes confused and agitated in the evenings, diagnosed dementia 2023" (behavior + diagnosis + timeframe)
  
✗ WEAK/VAGUE EVIDENCE (Do NOT include):
  - "May need mobility support" (too vague, no concrete evidence)
  - "Has various health conditions" (too generic, no specifics)
  - "Should be assessed for risks" (circular reasoning)
  - "Requires appropriate care" (meaningless filler)
  - "Mobility assessment needed" (stating need, not evidence)
  - "Has some difficulty walking" (vague - how much? why? what equipment?)

EVIDENCE DIVERSITY REQUIREMENT:
Each assessment needs 2+ snippets showing DIFFERENT aspects:
✓ GOOD (diverse): "Fell in bathroom in January 2026" + "Uses walking frame due to arthritis" (different aspects)
✗ BAD (repetitive): "Has mobility issues" + "Requires mobility support" (same thing said twice)

Each evidenceSnippets entry must be:
- A direct quote or close paraphrase from documents
- Contain SPECIFIC details (names, dates, numbers, equipment, conditions, incidents)
- Show a DIFFERENT aspect/facet of the risk (not just repetition)
- Not just state "needs assessment" - show WHY assessment is needed with concrete facts

QUALITY CHECKLIST BEFORE RESPONDING:
✓ Did I extract information ONLY from "Documents to analyze:" section (not templates)?
✓ Does each recommended assessment have STRONG documented evidence?
✓ Did I use FIRST PERSON ("I need", "My condition") in reason fields?
✓ Did I set "isMandatory": false for ALL assessments?
✓ Did I avoid recommending assessments without solid evidence?
✓ Is this truly person-centred for THIS service user (CQC 2024 / NHS England Principle #1)?`;

      sendProgress(20, "Scanning all documents with AI...", "ai_analysis");

      // Simulated progress during AI call
      let simulatedProgress = 20;
      progressInterval = setInterval(() => {
        if (simulatedProgress < 75) {
          simulatedProgress += 5;
          const messages = [
            "Scanning all uploaded documents...",
            "Building service user profile...",
            "Extracting medical conditions...",
            "Identifying care needs and activities...",
            "Matching profile to assessments...",
            "Finalizing recommendations...",
          ];
          const msgIndex = Math.floor((simulatedProgress - 20) / 10) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "ai_analysis");
        }
      }, 3000);

      const response = await executeSecureTextCompletion({
        endpoint: "/api/ai/analyze-risks",
        feature: "risk_analysis",
        model: getRiskAssessmentRecommendationModel(),
        userContext: aiUserContext,
        inputText: `⚠️ CRITICAL INSTRUCTIONS ⚠️

═══════════════════════════════════════════════════════════════════════════════
REMINDER: NHS ENGLAND PRINCIPLE #1 - PERSON-CENTRED CARE
═══════════════════════════════════════════════════════════════════════════════

"Actively focus on the experience of people using services"

→ BE THOROUGH: Find ALL risks SPECIFIC to THIS individual person documented in their files
→ BE SPECIFIC: Each risk must be tied to CONCRETE EVIDENCE about THIS person (not generic)
→ Recommend ONLY assessments supported by STRONG DOCUMENTED EVIDENCE about THIS service user
→ DO NOT recommend generic/blanket assessments "just in case"
→ Quality over quantity - better to omit than recommend without solid evidence
→ DOCUMENT-DRIVEN: Every recommendation must cite specific facts from the documents

═══════════════════════════════════════════════════════════════════════════════
DOCUMENT SOURCE RULES
═══════════════════════════════════════════════════════════════════════════════

1. Template documents above = STRUCTURE REFERENCE ONLY
   - They contain placeholder/example text (NOT real service user data)
   - DO NOT extract medical conditions, risks or needs from templates
   
2. Documents below = REAL SERVICE USER DOCUMENTS
   - Extract information ONLY from these documents
   - Scan thoroughly to build complete profile
   - Only recommend assessments with multiple supporting quotes

═══════════════════════════════════════════════════════════════════════════════
REAL SERVICE USER DOCUMENTS TO ANALYZE (EXTRACT FROM THESE ONLY)
═══════════════════════════════════════════════════════════════════════════════

${documentContentForAi}

═══════════════════════════════════════════════════════════════════════════════
END SERVICE USER DOCUMENTS
═══════════════════════════════════════════════════════════════════════════════

FINAL REMINDERS BEFORE YOU RESPOND:

⚠️ BE THOROUGH IN FINDING ALL SPECIFIC RISKS TO THIS PERSON ⚠️

Read through ALL documents carefully to identify EVERY potential risk that affects THIS specific individual.
Look for conditions, medications, incidents, behaviors, equipment, environment factors that create risks.
Don't default to blanket assessments - find the SPECIFIC documented risks for THIS person.

1. COMPREHENSIVE & THOROUGH: Recommend ALL assessments with STRONG evidence where you've found SPECIFIC documented risks to THIS person
   - Scan all documents carefully - don't miss documented risks
   - Include ALL assessments backed by concrete evidence (minimum 3-5, but can be 10+ if documented)
   
2. PERSON-CENTRED & SPECIFIC: Every risk must be tied to CONCRETE EVIDENCE about THIS individual (CQC 2024)
   - "Has diabetes requiring blood sugar monitoring twice daily" ✓ (specific to this person)
   - "May have health needs" ✗ (generic, vague)
   
3. FIRST PERSON: Write all "reason" fields using "I" and "my"

4. NO MANDATORY FLAGS: Set "isMandatory": false for ALL assessments

5. EVIDENCE REQUIRED: Each assessment needs 2-6 SPECIFIC direct quotes from documents above
   - Each quote must contain specific details (conditions, medications, incidents, equipment, dates)
   
6. NO SPECULATION: Do not assume or infer conditions not explicitly documented
   - Only recommend based on what's written in the documents

Remember: Extract information ONLY from service user documents above. Templates contain placeholder text to ignore.`,
        systemPrompt,
        maxCompletionTokens: 8000,
        temperature: 0,
        seed: 42,
        responseFormat: { type: "json_object" },
        useCache: false,
      });

      clearInterval(progressInterval);
      sendProgress(80, "Processing results...", "processing");

      const content = response.restoredText || "";
      const parsed = parseJsonFromContent(content);
      if (!parsed) {
        sendEvent('error', { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      const normalizedRecommendations = Array.isArray(parsed?.recommendedAssessments)
        ? parsed.recommendedAssessments
            .filter((item: any) => item && typeof item?.name === "string" && item.name.trim())
            .map((item: any) => ({
              name: canonicalizeAssessmentName(item.name),
              isMandatory: Boolean(item.isMandatory),
              reason: typeof item?.reason === "string" ? item.reason.trim() : "",
              evidence: typeof item?.evidence === "string" ? item.evidence.trim() : "",
              evidenceSnippets: normalizeStringArray(item?.evidenceSnippets),
            }))
        : [];

      const serviceUser: { initials: string; fullName?: string } = {
        initials: normalizeInitials(parsed?.serviceUser?.initials),
      };
      if (allowSensitiveView) {
        // Try AI-extracted name first, then fall back to regex extraction from original (unscrubbed) documents
        const aiFull = normalizeFullName(parsed?.serviceUser?.fullName);
        const fullName = aiFull || normalizeFullName(extractServiceUserFullName(documentContent));
        if (fullName) {
          serviceUser.fullName = fullName;
          // Derive initials from name if AI couldn't extract them
          if (serviceUser.initials === "N.N.") {
            serviceUser.initials = normalizeInitials(fullName);
          }
        }
      }
      // Fallback: if initials are still N.N., try extracting name from raw documents for initials only
      if (serviceUser.initials === "N.N.") {
        const extractedName = extractServiceUserFullName(documentContent);
        if (extractedName) {
          serviceUser.initials = normalizeInitials(extractedName);
        }
      }

      const result = {
        serviceUser,
        medicalConditions: normalizeStringArray(parsed?.medicalConditions),
        careActivities: normalizeStringArray(parsed?.careActivities),
        concerns: normalizeStringArray(parsed?.concerns),
        equipment: normalizeStringArray(parsed?.equipment),
        communicationNeeds: normalizeStringArray(parsed?.communicationNeeds),
        environmentalFactors: normalizeStringArray(parsed?.environmentalFactors),
        recommendedAssessments: normalizedRecommendations,
        documentSummary: typeof parsed?.documentSummary === "string" ? parsed.documentSummary.trim() : "Information not found in documents",
      };

      console.log(`[Risks] AI initially returned ${normalizedRecommendations.length} assessments`);
      console.log(`[Risks] Assessment names:`, normalizedRecommendations.map((a: any) => a.name));

      result.documentSummary = toFirstPerson(result.documentSummary);
      result.recommendedAssessments = result.recommendedAssessments.map((assessment: any) => ({
        ...assessment,
        reason: typeof assessment?.reason === "string" ? toFirstPerson(assessment.reason) : assessment?.reason,
      }));

      // NOTE: Removed old keyword-based buildAssessmentRecommendations in favor of AI-only recommendations
      // The AI now provides better evidence-backed, person-centred recommendations
      
      // CRITICAL FILTERING: Remove assessments without STRONG evidence
      // NHS England Principle #1: Person-centred care - only recommend what's documented
      const includedAssessmentNames: string[] = [];
      
      result.recommendedAssessments = result.recommendedAssessments.filter((assessment: any) => {
        const assessmentName = assessment?.name || 'Unknown';
        
        // Must have evidence field
        if (!assessment?.evidence || !assessment.evidence.trim()) {
          console.log(`[Risks] ❌ ${assessmentName}: No evidence field`);
          return false;
        }
        
        // Must have meaningful evidence (not negated)
        if (!isMeaningfulEvidence(assessment.evidence)) {
          console.log(`[Risks] ❌ ${assessmentName}: Evidence not meaningful`);
          return false;
        }
        
        // Must have at least 2 evidence snippets (STRONG evidence requirement)
        const snippets = normalizeStringArray(assessment?.evidenceSnippets || []).filter(isMeaningfulEvidence);
        if (snippets.length < 2) {
          console.log(`[Risks] ❌ ${assessmentName}: Only ${snippets.length} snippet(s), need 2+`);
          return false;
        }
        
        // Score evidence quality (0-100)
        const qualityScore = scoreEvidenceQuality(assessment.evidence, snippets);
        const MINIMUM_QUALITY_SCORE = 60; // Require at least 60/100 quality score (stricter quality gate)
        
        if (qualityScore < MINIMUM_QUALITY_SCORE) {
          console.log(`[Risks] ❌ ${assessmentName}: Quality score ${qualityScore}/100 (minimum ${MINIMUM_QUALITY_SCORE})`);
          return false;
        }
        
        // Must be relevant to service user profile
        if (!isAssessmentRelevantServer(assessment, result)) {
          console.log(`[Risks] ❌ ${assessmentName}: Not relevant to profile`);
          return false;
        }
        
        // Check for duplicates/similar assessments already included
        if (isSimilarAssessment(assessmentName, includedAssessmentNames)) {
          console.log(`[Risks] ❌ ${assessmentName}: Too similar to existing assessment`);
          return false;
        }
        
        // Check evidence diversity
        if (snippets.length >= 2 && !hasEvidenceDiversity(snippets)) {
          console.log(`[Risks] ⚠️  ${assessmentName}: Evidence lacks diversity (repetitive snippets)`);
          // Don't reject, but log warning
        }
        
        console.log(`[Risks] ✅ ${assessmentName}: ${snippets.length} snippets, quality ${qualityScore}/100`);
        includedAssessmentNames.push(assessmentName);
        return true;
      });

      // Clean up evidence snippets on remaining assessments
      result.recommendedAssessments = result.recommendedAssessments.map((assessment: any) => ({
        ...assessment,
        evidenceSnippets: normalizeStringArray(assessment?.evidenceSnippets).filter(isMeaningfulEvidence),
      }));

      console.log(`[Risks] FINAL: Sending ${result.recommendedAssessments.length} assessments to user`);
      console.log(`[Risks] Final assessment names:`, result.recommendedAssessments.map((a: any) => a.name));
      
      // Quality metrics summary
      if (result.recommendedAssessments.length > 0) {
        const avgSnippets = result.recommendedAssessments.reduce((sum: number, a: any) => 
          sum + (a.evidenceSnippets?.length || 0), 0) / result.recommendedAssessments.length;
        console.log(`[Risks] Quality metrics: ${result.recommendedAssessments.length} assessments, avg ${avgSnippets.toFixed(1)} snippets/assessment`);
      }

      // Template-Only AI: Convert tokens to readable placeholders (no PII in output)
      // Output is GDPR-exempt as it contains no personal data
      const templateResult = piiVault.toPlaceholders(result);
      console.log(`[Risks] Template Output: ${piiVault.getStats().total} fields converted to placeholders like [Name], [NHS Number]`);
      piiVault.logAudit('SCRUB', '/api/ai/analyze-risks', aiUserContext.userId, aiUserContext.username);
      
      // Always export vault for automatic client-side name restoration
      // The client restores PII values locally without them being retransmitted
      const vaultExport = piiVault.export();
      const payload = {
        ...templateResult,
        vaultExport,
        // Include the raw result with tokens for client-side restoration
        rawWithTokens: result,
      };
      console.log(`[Risks] Including vault export with ${vaultExport.mapping ? Object.keys(vaultExport.mapping).length : 0} tokens for automatic local restoration`);
      piiVault.logAudit('RESTORE', '/api/ai/analyze-risks', aiUserContext.userId, aiUserContext.username);
      
      // Cache only the template result — NEVER cache vaultExport (contains real PII)
      const cachePayload = { ...templateResult };
      setRiskAnalysisCache(cacheKey, cachePayload);
      sendProgress(100, "Complete!", "complete");
      sendEvent('result', payload);
      
      // Clear vault after use (security best practice)
      piiVault.clear();
      
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
    } catch (error: any) {
      console.error("Risk Analysis AI Error:", error);
      piiVault.clear(); // Clear vault on error too
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (progressInterval) clearInterval(progressInterval);
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: safeErrorMessage(error, "AI analysis failed") })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ message: safeErrorMessage(error, "AI analysis failed") });
    }
  });

  // Generate detailed risk assessment content
  app.post("/api/ai/generate-risk-assessment", requireAuth, async (req: any, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    // PII Vault for reversible scrubbing - keeps sensitive data local
    const piiVault = new PIIVault();
    
    try {
      const {
        documentContent,
        assessmentCategory,
        serviceUserInitials,
        performedBy,
        performedByJobTitle,
        allowSensitive,
        assessmentEvidence,
        analysisContext,
      } = req.body;
      const allowSensitiveView = Boolean(allowSensitive) && req.user?.role === "admin";
      
      if (!documentContent || !assessmentCategory) {
        return res.status(400).json({ message: "Document content and assessment category required" });
      }

      const safeServiceUserInitials = piiVault.scrubString(String(serviceUserInitials || "N.N."));
      const safePerformedBy = piiVault.scrubString(String(performedBy || "Staff member"));

      // Set up SSE for progress streaming with production-safe settings
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const corsOrigin = process.env.CORS_ORIGIN;
      if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.flushHeaders();

      // Heartbeat to keep connection alive during long AI processing
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 10000);

      const sendEvent = (eventType: string, data: any) => {
        try {
          const padding = `: ${'x'.repeat(4096)}\n\n`;
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          res.write(padding + payload);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        } catch (e) {
          console.error('[RiskGen SSE] Write error:', e);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      const sendProgress = (percent: number, status: string, stage: string) => {
        console.log(`[RiskGen SSE] Progress: ${percent}% - ${status}`);
        sendEvent('progress', { percent, status, stage });
      };

      sendProgress(10, "Analyzing documents...", "analyzing");

      if (!isAIEnabled()) {
        piiVault.logAudit('SCRUB', '/api/ai/generate-risk-assessment', aiUserContext.userId, aiUserContext.username);
        sendProgress(35, "Generating rule-based risk assessment...", "rule_based");
        const scrubbedDocumentContent = piiVault.scrub(documentContent);
        const fallbackResult = buildRuleBasedRiskAssessmentPayload({
          documentContent: scrubbedDocumentContent,
          assessmentCategory,
          serviceUserInitials: safeServiceUserInitials,
          performedBy: safePerformedBy,
          performedByJobTitle,
        });
        const templateResult = piiVault.toPlaceholders(fallbackResult);
        // Always export vault for automatic name restoration
        const vaultExport = piiVault.export();
        const payload = {
          ...templateResult,
          vaultExport,
          rawWithTokens: fallbackResult,
        };
        piiVault.logAudit('RESTORE', '/api/ai/generate-risk-assessment', aiUserContext.userId, aiUserContext.username);
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', payload);
        piiVault.clear();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      const riskAssessmentPolicies = await storage.getPolicyDocumentsByCategory("risk_assessment");
      const initialAssessmentPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");

      let policyContext = "";
      const allPolicies = [...riskAssessmentPolicies, ...initialAssessmentPolicies, ...scopeOfPracticePolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY/TEMPLATE DOCUMENTS - FOR STRUCTURE REFERENCE ONLY ===

⚠️ CRITICAL WARNING: The documents below are TEMPLATES/EXAMPLES containing PLACEHOLDER and EXAMPLE text.
⚠️ DO NOT use ANY information from these templates as real service user data.
⚠️ These templates show you the STRUCTURE and FORMAT to follow, but contain NO actual service user information.
⚠️ Any risks, conditions, or care needs in these templates are EXAMPLES ONLY - IGNORE THEM.
⚠️ ONLY use information from the "Documents to analyze:" section which contains REAL service user documents.

${riskAssessmentPolicies.map(p => `--- RISK ASSESSMENT TEMPLATE (STRUCTURE REFERENCE ONLY): ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}
${initialAssessmentPolicies.map(p => `--- INITIAL ASSESSMENT TEMPLATE (STRUCTURE REFERENCE ONLY): ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}
${scopeOfPracticePolicies.map(p => `--- SCOPE OF PRACTICE (REFERENCE ONLY): ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}

=== END POLICY/TEMPLATE DOCUMENTS ===

CRITICAL REMINDER:
- Templates above are for STRUCTURE/FORMAT reference only
- DO NOT use any content from templates as service user information
- ONLY extract information from the actual service user documents provided below

`;
      }

      const privacyDirective = allowSensitiveView
        ? "Privacy: Personal data in documents has been tokenized (e.g. {{PII_...}}). Keep these tokens in your output - they will be converted to readable placeholders like [Name], [NHS Number]. Never try to guess real values."
        : "Privacy: Personal data has been tokenized. Keep tokens in output for automatic placeholder conversion.";

      const evidenceSnippets = Array.isArray(assessmentEvidence?.evidenceSnippets)
        ? assessmentEvidence.evidenceSnippets.filter(isMeaningfulEvidence)
        : [];
      const evidencePack = [
        typeof assessmentEvidence?.evidence === "string" ? assessmentEvidence.evidence.trim() : "",
        ...evidenceSnippets,
      ]
        .filter((snippet) => isMeaningfulEvidence(snippet))
        .join("\n- ");

      const profileContext = analysisContext
        ? JSON.stringify(
            {
              medicalConditions: normalizeStringArray(analysisContext.medicalConditions),
              careActivities: normalizeStringArray(analysisContext.careActivities),
              concerns: normalizeStringArray(analysisContext.concerns),
              equipment: normalizeStringArray(analysisContext.equipment),
              communicationNeeds: normalizeStringArray(analysisContext.communicationNeeds),
              environmentalFactors: normalizeStringArray(analysisContext.environmentalFactors),
              documentSummary:
                typeof analysisContext.documentSummary === "string"
                  ? analysisContext.documentSummary.trim()
                  : undefined,
            },
            null,
            2
          )
        : "";

      const systemPrompt = `You are an expert care risk assessor for a UK care facility. Generate a detailed, comprehensive risk assessment for the specified category.
${policyContext}

FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (—) or en-dashes (–). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

⚠️ CRITICAL: DOCUMENT SOURCE SEPARATION ⚠️
1. Template/policy documents above are for STRUCTURE REFERENCE ONLY - they contain example/placeholder text
2. REAL service user information is ONLY in the "Documents to analyze:" section
3. DO NOT extract risks, conditions, or care needs from templates - they are examples only
4. DO NOT confuse template content with actual service user information
5. Templates may contain example risks like "falls", "choking", etc. - these are PLACEHOLDERS, not real incidents

FIRST PERSON WRITING:
- Write EVERYTHING in first person as the service user speaking about themselves
- Use "I", "me", "my", "myself" throughout ALL fields
- Vary your sentence structure naturally - do not repeat the same opening phrases

PERSON-CENTRED DETAIL REQUIREMENTS:
- Each riskDefinition, howItsARisk and controlMeasures should be 2-4 sentences with rich, specific detail
- Include impact on my daily life, triggers, early warning signs and what helps me feel safe
- Describe how I prefer support to be delivered (pace, prompts, reassurance, environment)
- Avoid vague phrases like "appropriate support" or "assist as needed"

WHO WILL BE HARMED - BE ACCURATE:
- Consider ALL people who could be affected, not just carers
- Options include combinations of: Service User, Care Workers, Family Members, Health Professionals, Visitors, Other Service Users
- Be specific - if multiple people could be harmed, list them (e.g., "Service User and Care Workers" or "Service User, Family Members and Visitors")
- Think about who is actually present during care activities

EVIDENCE-BASED PRACTICE - CRITICAL REQUIREMENTS:
1. ONLY use information EXPLICITLY stated in the SERVICE USER documents provided (not from templates) - never invent, assume, or fabricate details
2. Base ALL risk identifications on ACTUAL evidence from the SERVICE USER documents (conditions, incidents, concerns mentioned)
3. Do NOT make up medical conditions, incidents, or risks that are not documented in the SERVICE USER documents
4. Templates may mention example risks - IGNORE these and only use SERVICE USER document content
5. If information is not in the SERVICE USER documents, DO NOT include it - leave it out entirely
6. Control measures must be based on standard care practices relevant to the documented risks
7. Risk ratings must reflect the ACTUAL severity based on what is documented, not hypothetical scenarios
8. NEVER fabricate incidents, falls, behaviors, or medical events that are not mentioned in the SERVICE USER documents
9. Use clinical reasoning based on documented facts from SERVICE USER documents, not speculation or template examples

IMPORTANT RULES:
1. Extract and synthesize ALL relevant information from the documents provided
2. Write detailed, informative content - be thorough and comprehensive
3. Use professional but clear language suitable for care documentation
4. Follow CQC (Care Quality Commission) evidence-based standards
5. Do NOT include any person names. Use role terms (my carer, my GP, my family member, my care team)
6. Keep place names and locations as written. Do not redact places.
7. If the documents contain questions, treat them as prompts and respond with statements. Do not output questions.
8. Stay within a care worker's scope of practice. Do not diagnose, prescribe, change doses, or make clinical decisions.
9. NEVER write phrases like "I'm not aware of", "information not found", "not mentioned in documents", or similar. Only write what IS known.
10. If a field has limited information, write what is relevant from the documents - do not apologise or explain gaps.
11. Every risk you identify MUST be traceable to specific evidence in the documents provided.
12. Do not embellish or exaggerate - stick to the facts as documented.

SERVICE USER DETAILS:
- Service User Initials: ${safeServiceUserInitials}

EVIDENCE PACK - USE THIS FIRST:
${evidencePack ? `- ${evidencePack}` : "- No pre-extracted evidence pack provided. Use only the document content."}

PROFILE CONTEXT (from analysis):
${profileContext || "Not provided."}

${privacyDirective}

RISK ASSESSMENT CATEGORY: ${assessmentCategory}

CRITICAL REQUIREMENT - IDENTIFY ALL RISKS:
- A comprehensive risk assessment typically has MULTIPLE risks (usually 3-8 risks depending on the category)
- For EACH distinct risk identified in this category, create a separate entry in the "risks" array
- Think broadly about all the different ways this category could present risks for this service user
- Examples: Falls Prevention might include risks from: dizziness/balance issues, environmental hazards, medication side effects, visual impairment, footwear, etc.
- DO NOT combine multiple distinct risks into a single entry - separate them out

For each risk identified in this category, provide detailed first-person content:
- Risk definition (what is the risk - written in first person)
- Initial risk rating (Low/Medium/High)
- How it's a risk (detailed first-person explanation of the consequences)
- Who will be harmed (be accurate - list all relevant people)
- Control measures (comprehensive measures in first person)
- Risk rating after controls (Low/Medium/High)

Respond ONLY with valid JSON in this exact format:
{
  "category": "${assessmentCategory}",
  "serviceUserInitials": "${safeServiceUserInitials}",
  "assessmentDate": "Today's date in DD/Mon/YYYY format",
  "risks": [
    {
      "riskDefinition": "First person description with varied openings - not always 'I am at risk of'",
      "initialRating": "Low/Medium/High",
      "howItsARisk": "First person explanation with varied sentence structure - not always 'This affects me'",
      "whoWillBeHarmed": "List ALL relevant people who could be harmed (e.g., 'Service User and Care Workers' or 'Service User, Family Members and Visitors')",
      "controlMeasures": "First person detailed control measures",
      "ratingAfterControls": "Low/Medium/High"
    },
    {
      "riskDefinition": "Second distinct risk in first person",
      "initialRating": "Low/Medium/High",
      "howItsARisk": "Explanation of second risk",
      "whoWillBeHarmed": "People affected by this risk",
      "controlMeasures": "Control measures for this specific risk",
      "ratingAfterControls": "Low/Medium/High"
    }
    // ... include ALL relevant risks for this category - typically 3-8 risks total
  ],
  "signedBy": "${safePerformedBy}",
  "jobTitle": "${performedByJobTitle || 'Care Staff'}",
  "additionalNotes": "Any relevant first-person observations (leave empty string if nothing additional to add)"
}`;

      // Pre-scrub content BEFORE AI call for accurate audit logging
      const scrubbedDocumentContent = piiVault.scrub(documentContent);
      const scrubbedEvidencePack = evidencePack ? piiVault.scrub(evidencePack) : "";
      const scrubbedProfileContext = profileContext ? piiVault.scrub(profileContext) : "";
      
      const vaultScrubStats = piiVault.getStats();
      console.log(`[RiskAssessment] PII Vault: Scrubbed ${vaultScrubStats.total} sensitive items (including evidence pack)`);
      piiVault.logAudit('SCRUB', '/api/ai/generate-risk-assessment', aiUserContext.userId, aiUserContext.username);
      
      sendProgress(30, "Generating risk assessment...", "ai_generation");

      // ════════════════════════════════════════════════════════════════════
      // DEBUG: LOG COMPLETE AI INPUT - RISK ASSESSMENT
      // ════════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('📋 RISK ASSESSMENT AI INPUT - CONTENT SENT TO AI');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log(`Assessment Category: ${assessmentCategory}`);
      console.log(`Model: ${getRiskAssessmentGenerationModel()}`);
      console.log(`Service User: ${safeServiceUserInitials}`);
      console.log(`Performed By: ${safePerformedBy} (${performedByJobTitle})`);
      console.log('');
      
      const userContent = `Generate a comprehensive ${assessmentCategory} risk assessment in first person based on the SERVICE USER documents below.

${scrubbedProfileContext ? `Profile Context:\n${scrubbedProfileContext}\n\n` : ''}Documents to analyze:\n${scrubbedDocumentContent}${scrubbedEvidencePack ? `\n\nKey Evidence:\n- ${scrubbedEvidencePack}` : ''}`;
      
      console.log('📊 CONTENT STATS:');
      console.log(`   Document Content Length: ${scrubbedDocumentContent.length.toLocaleString()} chars (scrubbed)`);
      console.log(`   Evidence Pack Length: ${scrubbedEvidencePack.length.toLocaleString()} chars (scrubbed)`);
      console.log(`   Total User Content: ${userContent.length.toLocaleString()} chars`);
      console.log(`   Policy Context Length: ${policyContext.length.toLocaleString()} chars`);
      console.log('');
      
      console.log('📄 DOCUMENT CONTENT PREVIEW (First 2000 characters, PII-scrubbed):');
      console.log('─────────────────────────────────────────────────────────────────');
      console.log(scrubbedDocumentContent.substring(0, 2000));
      if (scrubbedDocumentContent.length > 2000) {
        console.log(`\n... [${(scrubbedDocumentContent.length - 2000).toLocaleString()} more characters] ...\n`);
      }
      console.log('─────────────────────────────────────────────────────────────────');
      console.log('');
      
      if (scrubbedEvidencePack) {
        console.log('🔍 KEY EVIDENCE EXTRACTED (PII-scrubbed):');
        console.log('─────────────────────────────────────────────────────────────────');
        console.log(scrubbedEvidencePack.substring(0, 1000));
        if (scrubbedEvidencePack.length > 1000) {
          console.log(`\n... [${(scrubbedEvidencePack.length - 1000).toLocaleString()} more characters] ...\n`);
        }
        console.log('─────────────────────────────────────────────────────────────────');
        console.log('');
      }
      
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('\n');

      // Simulated progress during AI call
      let simulatedProgress = 30;
      progressInterval = setInterval(() => {
        if (simulatedProgress < 65) {
          simulatedProgress += 5;
          const messages = [
            "Analyzing documented risks...",
            "Building risk definitions...",
            "Assessing control measures...",
            "Calculating risk ratings...",
            "Formatting assessment structure...",
          ];
          const msgIndex = Math.floor((simulatedProgress - 30) / 7) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "ai_generation");
        }
      }, 3000);

      const response = await executeSecureTextCompletion({
        endpoint: "/api/ai/generate-risk-assessment",
        feature: "risk_assessment",
        model: getRiskAssessmentGenerationModel(),
        userContext: aiUserContext,
        inputText: `Generate a comprehensive ${assessmentCategory} risk assessment in first person based on the SERVICE USER documents below.

⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY ⚠️

1. Identify and list ALL distinct risks within this category (typically 3-8 separate risks)
2. ONLY use information EXPLICITLY stated in the SERVICE USER documents below (NOT from templates above)
3. Templates above contain EXAMPLE text - IGNORE any risks, conditions, or care needs mentioned in templates
4. DO NOT invent, fabricate, or assume any medical conditions, incidents, or risks not mentioned in the SERVICE USER documents
5. Every risk must be evidence-based - traceable to specific information in the SERVICE USER documents below
6. Do not make up falls, behaviors, medical events, or other incidents that are not documented in the SERVICE USER documents
7. Write detailed, thorough content for each field based ONLY on documented facts from SERVICE USER documents

Evidence pack for this category (use these facts first and ensure every risk maps to them or the SERVICE USER documents):
${scrubbedEvidencePack ? `- ${scrubbedEvidencePack}` : "- No evidence pack provided."}

=== REAL SERVICE USER DOCUMENTS TO ANALYZE (EXTRACT INFORMATION FROM THESE ONLY) ===

${scrubbedDocumentContent}

=== END SERVICE USER DOCUMENTS ===

Remember: Extract information ONLY from the service user documents above. Templates contain placeholder/example text that should be ignored.`,
        systemPrompt,
        temperature: 0.2,
        maxCompletionTokens: 12000,
        responseFormat: { type: "json_object" },
        useCache: false,
      });

      if (progressInterval) clearInterval(progressInterval);
      sendProgress(70, "Processing results...", "processing");

      const content = response.restoredText || "";
      const parsed = parseJsonFromContent(content);
      if (parsed) {
        let result = parsed;
        
        // Preserve fields that should NOT be scrubbed (they contain expected values)
        const preservedFields = {
          assessmentDate: formatRiskAssessmentDate(),
          signedBy: normalizeSignedByName(result.signedBy || safePerformedBy || 'Staff member'),
          jobTitle: result.jobTitle || performedByJobTitle || 'Care Staff',
          category: result.category,
        };
        
        // Apply PII scrubbing to the rest (risks, notes, etc.)
        result.serviceUserInitials = normalizeInitials(result.serviceUserInitials);

        // Helper to clean "not aware" type phrases from any string
        const cleanNotAwarePhrases = (text: string): string => {
          if (!text || typeof text !== "string") return text;
          const patterns = [
            /I'?m not aware[^.]*\.?\s*/gi,
            /information not found[^.]*\.?\s*/gi,
            /not mentioned in[^.]*documents[^.]*\.?\s*/gi,
            /no additional information[^.]*\.?\s*/gi,
            /based on the documents provided[^.]*\.?\s*/gi,
            /I don'?t have[^.]*information[^.]*\.?\s*/gi,
            /details were not[^.]*\.?\s*/gi,
          ];
          let cleaned = text;
          for (const pattern of patterns) {
            cleaned = cleaned.replace(pattern, "").trim();
          }
          return cleaned;
        };

        const evidenceHints: string[] = scrubbedEvidencePack
          ? scrubbedEvidencePack
              .split(/\n+/)
              .map((line: string) => line.replace(/^[-•]\s*/, "").trim())
              .filter(Boolean)
              .slice(0, 8)
          : [];
        const hasSpecificDetail = (value: string) =>
          /\d|mg|ml|hour|minute|am|pm|wheelchair|hoist|frame|walker|oxygen|insulin|falls|seizure|pressure|catheter|stairs|dementia|diabetes|epilepsy|copd|asthma|stroke|arthritis|skin|wound|ulcer/i.test(value);
        const improveField = (value: string, fallback: string) => {
          const trimmed = value?.trim() || "";
          if (trimmed.length >= 40 && hasSpecificDetail(trimmed)) return trimmed;
          const hint = evidenceHints.find((line: string) => line.length > 12) || "";
          if (hint) {
            return `${trimmed || fallback} ${toFirstPerson(hint)}`.trim();
          }
          return trimmed || fallback;
        };
        const ensureDetailed = (value: string) => {
          const sentenceCount = value.split(/[.!?]+/).filter((s) => s.trim().length > 10).length;
          if (sentenceCount >= 2) return value;
          const hint = evidenceHints.find((line: string) => line.length > 12) || "";
          const extra = hint
            ? ` ${toFirstPerson(hint)}.`
            : " I prefer calm, clear support that follows my care plan and keeps me safe.";
          return `${value.trim()}${extra}`.trim();
        };

        if (!Array.isArray(result.risks) || result.risks.length === 0) {
          result.risks = [
            {
              riskDefinition: "I require support with this area of my care",
              initialRating: "Medium",
              howItsARisk: "Without appropriate support in this area, my health and wellbeing could be affected.",
              whoWillBeHarmed: "Service user",
              controlMeasures: "My care team will assess my needs in this area and provide appropriate support as outlined in my care plan.",
              ratingAfterControls: "Low",
            },
          ];
        }
        
        // Restore preserved fields (override any scrubbed values)
        result.assessmentDate = preservedFields.assessmentDate;
        result.signedBy = normalizeSignedByName(preservedFields.signedBy || "Staff member");
        result.jobTitle = preservedFields.jobTitle;
        result.category = preservedFields.category;

        if (Array.isArray(result.risks)) {
          result.risks = result.risks.map((risk: any) => {
            const riskDefinition = typeof risk?.riskDefinition === "string"
              ? cleanNotAwarePhrases(toFirstPerson(risk.riskDefinition))
              : "";
            const howItsARisk = typeof risk?.howItsARisk === "string"
              ? cleanNotAwarePhrases(toFirstPerson(risk.howItsARisk))
              : "";
            const controlMeasures = typeof risk?.controlMeasures === "string"
              ? cleanNotAwarePhrases(toFirstPerson(sanitizeOutOfScopeText(risk.controlMeasures)))
              : "";
            return {
              ...risk,
              initialRating: normalizeRiskRating(risk?.initialRating),
              riskDefinition: ensureDetailed(improveField(riskDefinition, "I have a documented risk in this area of my care.")),
              howItsARisk: ensureDetailed(improveField(howItsARisk, "This risk could affect my safety and wellbeing without the right support.")),
              controlMeasures: ensureDetailed(improveField(controlMeasures, "My care team will follow my care plan and provide support to reduce this risk.")),
              whoWillBeHarmed: typeof risk?.whoWillBeHarmed === "string" && risk.whoWillBeHarmed.trim().length > 0
                ? risk.whoWillBeHarmed.trim()
                : "Service User and Care Workers",
              ratingAfterControls: normalizeRiskRating(risk?.ratingAfterControls),
            };
          });
        }

        const riskQualityScores = Array.isArray(result.risks)
          ? result.risks.map((risk: any) => {
              const fields = [risk?.riskDefinition, risk?.howItsARisk, risk?.controlMeasures]
                .filter((val: string) => typeof val === "string")
                .join(" ");
              let score = 0;
              if (fields.length > 120) score += 40;
              if (hasSpecificDetail(fields)) score += 40;
              if (fields.split(/\s+/).length > 40) score += 20;
              return score;
            })
          : [];
        const averageRiskScore = riskQualityScores.length
          ? riskQualityScores.reduce((sum: number, score: number) => sum + score, 0) / riskQualityScores.length
          : 0;

        if (!result.risks || result.risks.length < 2 || averageRiskScore < 60) {
          console.warn(`[RiskAssessment] Low quality AI output (risks=${result.risks?.length || 0}, avgScore=${averageRiskScore.toFixed(1)}). Using rule-based fallback.`);
          const fallbackResult = buildRuleBasedRiskAssessmentPayload({
            documentContent: scrubbedDocumentContent,
            assessmentCategory,
            serviceUserInitials: safeServiceUserInitials,
            performedBy: safePerformedBy,
            performedByJobTitle,
          });
          result = fallbackResult;
          result.serviceUserInitials = normalizeInitials(result.serviceUserInitials);
          result.assessmentDate = preservedFields.assessmentDate;
          result.signedBy = normalizeSignedByName(preservedFields.signedBy || "Staff member");
          result.jobTitle = preservedFields.jobTitle;
          result.category = preservedFields.category;
        }
        if (typeof result.additionalNotes === "string") {
          result.additionalNotes = cleanNotAwarePhrases(toFirstPerson(result.additionalNotes));
          // If additionalNotes is now empty or just whitespace, set to empty string
          if (!result.additionalNotes || result.additionalNotes.trim().length < 5) {
            result.additionalNotes = "";
          }
        }
        
        // Template-Only AI: Convert tokens to readable placeholders (no PII in output)
        // Output is GDPR-exempt as it contains no personal data
        const templateResult = piiVault.toPlaceholders(result);
        console.log(`[RiskAssessment] Template Output: ${piiVault.getStats().total} fields converted to placeholders`);
        
        // Always export vault for automatic client-side name restoration
        const vaultExport = piiVault.export();
        const payload = {
          ...templateResult,
          vaultExport,
          rawWithTokens: result,
        };
        console.log(`[RiskAssessment] Including vault export with ${vaultExport.mapping ? Object.keys(vaultExport.mapping).length : 0} tokens for automatic local restoration`);
        piiVault.logAudit('RESTORE', '/api/ai/generate-risk-assessment', aiUserContext.userId, aiUserContext.username);
        
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', payload);
        
        // Clear vault after use (security best practice)
        piiVault.clear();
        
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        piiVault.clear(); // Clear vault on error too
        sendEvent('error', { message: "Failed to parse AI response" });
        if (progressInterval) clearInterval(progressInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error: any) {
      console.error("Risk Assessment Generation Error:", error);
      piiVault.clear(); // Clear vault on error too
      if (progressInterval) clearInterval(progressInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: safeErrorMessage(error, "AI generation failed") })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ message: safeErrorMessage(error, "AI generation failed") });
    }
  });

  // Generate detailed first-person care plan from uploaded documents - CHUNKED APPROACH
  // Generates each section individually for faster feedback and better reliability
  // Get service user call types from database
  app.post("/api/service-user/call-types", requireAuth, async (req: any, res) => {
    try {
      const { serviceUserName } = req.body;
      if (!serviceUserName || typeof serviceUserName !== "string") {
        return res.status(400).json({ message: "Service user name required" });
      }

      // Search for service orders matching this service user (fuzzy match)
      const allOrders = await storage.getAllServiceOrders();
      const matchedOrders = allOrders.filter((order) => {
        const orderName = (order.serviceUserName || "").toLowerCase().trim();
        const searchName = serviceUserName.toLowerCase().trim();
        // Match if names are similar (contains, starts with, or exact match)
        return orderName.includes(searchName) || searchName.includes(orderName) || orderName === searchName;
      });

      if (matchedOrders.length === 0) {
        return res.json({ callTypes: [], message: "No call types found for this service user" });
      }

      // Extract unique call types
      const callTypes = Array.from(new Set(matchedOrders.map((o) => o.callTypeLabel)));
      const serviceUserKey = matchedOrders[0]?.serviceUserKey;
      
      return res.json({ 
        callTypes, 
        serviceUserKey,
        serviceUserName: matchedOrders[0]?.serviceUserName,
        orders: matchedOrders.map(o => ({
          callType: o.callTypeLabel,
          timeBand: o.timeBand,
          daysPerWeek: o.daysPerWeek,
          duration: o.serviceRequirementMinutes,
          carersRequired: o.carersRequired
        }))
      });
    } catch (error: any) {
      console.error("Get call types error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get call types") });
    }
  });

  app.post("/api/ai/generate-care-plan", requireAuth, async (req: any, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    // PII Vault for reversible scrubbing - keeps sensitive data local
    const piiVault = new PIIVault();
    
    try {
      const { documentContent, serviceUserInitials, allowSensitive, callType } = req.body;
      const allowSensitiveView = Boolean(allowSensitive) && req.user?.role === "admin";
      
      if (!documentContent) {
        return res.status(400).json({ message: "Document content required" });
      }

      // Set up SSE for progress streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const corsOrigin = process.env.CORS_ORIGIN;
      if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.flushHeaders();

      // Heartbeat every 5 seconds to keep connection alive
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 5000);

      const sendEvent = (eventType: string, data: any) => {
        try {
          const padding = `: ${'x'.repeat(4096)}\n\n`;
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          res.write(padding + payload);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        } catch (e) {
          console.error('[CarePlan SSE] Write error:', e);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      
      const sendProgress = (percent: number, status: string, stage: string) => {
        console.log(`[CarePlan SSE] Progress: ${percent}% - ${status}`);
        sendEvent('progress', { percent, status, stage });
      };

      sendProgress(5, "Loading policy documents...", "loading_policies");

      const today = new Date().toLocaleDateString("en-GB");

      // Fetch ALL policy documents for comprehensive care planning
      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const taskListPolicies = await storage.getPolicyDocumentsByCategory("care_tasks");
      const socialWorkerPolicies = await storage.getPolicyDocumentsByCategory("social_worker");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");
      const initialAssessmentPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      
      // Build policy context
      let policyContext = "";
      const allPolicies = [...carePlanPolicies, ...taskListPolicies, ...socialWorkerPolicies, ...scopeOfPracticePolicies, ...initialAssessmentPolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY DOCUMENTS - FOLLOW THESE EXACTLY ===
${initialAssessmentPolicies.map(p => `--- INITIAL ASSESSMENT: ${p.name} ---\n${p.content}`).join('\n')}
${carePlanPolicies.map(p => `--- CARE PLAN TEMPLATE: ${p.name} ---\n${p.content}`).join('\n')}
${taskListPolicies.map(p => `--- APPROVED TASKS: ${p.name} ---\n${p.content}`).join('\n')}
${socialWorkerPolicies.map(p => `--- SOCIAL WORKER TASKS: ${p.name} ---\n${p.content}`).join('\n')}
${scopeOfPracticePolicies.map(p => `--- SCOPE OF PRACTICE: ${p.name} ---\n${p.content}`).join('\n')}
=== END POLICIES ===

REQUIREMENTS:
1. ONLY use tasks from approved lists above - do NOT invent new tasks.
2. Social worker document states EXACT support - include ALL those tasks.
3. Follow CQC (Care Quality Commission) standards.
`;
      }

      // Define all 12 mandatory sections
      const mandatorySections = [
        { title: "WARNING - Safety Concerns & Risks", priority: "high", focus: "Safety warnings, fall risks, medical alerts, emergency procedures, things carers MUST know immediately" },
        { title: "Introduction & My Life Story", priority: "medium", focus: "Personal history, family, interests, what makes me who I am, my background and preferences" },
        { title: "My Well-being & Emotional Needs", priority: "medium", focus: "Mental health, emotional support needs, what makes me happy/sad, how I cope with change" },
        { title: "Tasks Required by Social Workers", priority: "high", focus: "EXACT tasks from social worker document - all commissioned support activities" },
        { title: "Personal Care", priority: "medium", focus: "Washing, bathing, dressing, grooming, oral care - my specific preferences and routines" },
        { title: "Mobility & Transfers", priority: "medium", focus: "How I move, equipment needed (hoist, frame, wheelchair), transfer techniques, positioning" },
        { title: "Nutrition & Hydration", priority: "medium", focus: "Diet requirements, food preferences, swallowing difficulties, meal preparation, fluid intake" },
        { title: "Medication", priority: "high", focus: "Medication routine, reminders needed, storage, administration support, side effects to watch" },
        { title: "Continence Care", priority: "medium", focus: "Continence needs, products used, toilet assistance, dignity considerations" },
        { title: "Communication", priority: "medium", focus: "How I communicate, hearing/vision needs, language, how to engage with me effectively" },
        { title: "Household Tasks", priority: "low", focus: "Cleaning, laundry, shopping, household maintenance support I need" },
        { title: "Secure Property Before Leaving", priority: "high", focus: "Door locks, windows, appliances off, keys, alarm system - safety checklist before carers leave" },
      ];

      const privacyRules = allowSensitiveView
        ? "- Personal data has been tokenized ({{PII_...}}). Keep tokens in output - they become [Name], [Date] etc."
        : "- Personal data has been tokenized. Keep tokens in output for placeholder conversion.";

      // Call type context for specific care plans
      const callTypeLabel = callType || "General";
      const callTypeContext = callType ? `
═══════════════════════════════════════════════════════════════════════════════
⚠️ CALL TYPE: ${callType} - DETAILED GUIDANCE
═══════════════════════════════════════════════════════════════════════════════

This care plan is for ${callType} calls ONLY. Focus EXCLUSIVELY on tasks during ${callType} visits.

${callType === 'Morning' ? `MORNING CALL FOCUS:
✓ Waking up routine: how I like to be woken, time preferences
✓ Personal care: washing, bathing/shower, oral care, skin care
✓ Dressing: my clothing preferences, dignity, assistance level needed
✓ Continence care: pad changes, toilet assistance
✓ Breakfast: what I eat, dietary needs, assistance with eating/drinking
✓ Morning medications: which meds, prompts vs. administration
✓ Mobility: getting out of bed, transfers, equipment used
✓ Safety: check environment, remove hazards` : ''}

${callType === 'Lunch' ? `LUNCH CALL FOCUS:
✓ Meal preparation: what I eat for lunch, preferences, dietary requirements
✓ Eating assistance: level of support, utensils, positioning
✓ Hydration: drinks offered, fluid intake monitoring
✓ Lunchtime medications if applicable
✓ Personal care: toileting, pad changes if needed
✓ Repositioning: pressure relief, comfort, skin checks
✓ Activities: social interaction, engagement during visit
✓ Safety checks: environment, wellbeing, any concerns` : ''}

${callType === 'Tea' ? `TEA CALL FOCUS:
✓ Tea/snack preparation: preferences, dietary needs
✓ Hydration: afternoon fluids, preferences
✓ Evening medications if scheduled
✓ Personal care: toileting, hygiene, pad changes if needed  
✓ Light activities: conversation, TV, comfort
✓ Repositioning: pressure relief if applicable
✓ Check wellbeing: mood, pain, concerns
✓ Prepare for evening: lighting, comfort, safety` : ''}

${callType === 'Bed' ? `BEDTIME CALL FOCUS:
✓ Night medications: which meds, timing, prompts
✓ Personal care: evening wash, oral care, skincare routine
✓ Continence care: pad changes, toileting
✓ Undressing: night clothes, dignity, preferences
✓ Bed transfers: safe transfer to bed, equipment, positioning
✓ Comfort: pillows, covers, positioning for sleep
✓ Night routine: anything that helps me sleep (music, TV, lights)
✓ Safety: call bell within reach, room secure, night light
✓ Secure property: all doors locked, windows closed, appliances off` : ''}

${callType === 'Domestic' ? `DOMESTIC CALL FOCUS:
✓ Cleaning: which rooms, specific tasks (hoover, dust, mop)
✓ Laundry: washing, drying, ironing, putting away
✓ Kitchen: dishes, surfaces, bin emptying
✓ Shopping: list preparation, shopping assistance, putting away
✓ Meal preparation: batch cooking, freezer meals
✓ Bathroom: cleaning, restocking supplies
✓ Bedroom: changing bed linen, tidying
✓ General tidying: sorting, organizing
✓ Note: Include ONLY domestic tasks - no personal care unless specifically documented` : ''}

CRITICAL: Include ONLY the tasks relevant to ${callType} calls.
Do NOT include tasks from other call types (e.g., don't mention breakfast in a Bed call).
═══════════════════════════════════════════════════════════════════════════════
` : "";

      const baseSystemPrompt = `You are an expert care plan writer for UK care facilities following CQC 2024 standards.

═══════════════════════════════════════════════════════════════════════════════
CQC 2024 PERSON-CENTRED CARE PLANNING
═══════════════════════════════════════════════════════════════════════════════

✓ Individual preferences must be met
✓ Physical, mental, emotional and social needs
✓ Build on strengths, prevent declines  
✓ Quality of life: dignity, autonomy, meaningful activity
✓ Person-centred: holistic support, not just tasks

NHS ENGLAND CARE PLANNING PRINCIPLES:
1. Person-centred: Focus on MY needs, preferences and goals
2. Collaborative: Include information from family, professionals
3. Specific & Detailed: Times, methods, preferences, equipment
4. Outcome-focused: State what good care achieves for me
5. Living document: Can be updated as my needs change

${policyContext}${callTypeContext}
WRITING QUALITY STANDARDS:

✓ FIRST PERSON: Write as "I", "my", "me" (never "the service user" or "client")
✓ SPECIFIC DETAIL: Include exact times, specific preferences, named equipment
✓ ACTIONABLE: Carers must know EXACTLY what to do from reading this
✓ STEP-BY-STEP: Describe routines in sequence (first this, then that)
✓ COMPREHENSIVE: Cover ALL aspects relevant to this call type
✓ PERSON-CENTRED DETAIL: Include what matters to me, preferences, triggers, sensory needs, communication style and how I want support delivered
✓ DIGNIFIED: Maintain my dignity, privacy and respect throughout
✓ SAFETY: Highlight any risks, equipment needs, medical considerations
✓ READABLE: Use clear sentences (15-25 words average), avoid jargon
✓ CONSISTENT: Use same terms throughout (don't switch between "walking frame" and "zimmer")

FORMATTING RULES:
- Never use m-dashes (—) or en-dashes (–). Use hyphens (-) or commas
- Never use Oxford commas (no comma before final "and" in a list)
- Use British English spelling and terms
${privacyRules}
- Keep place names as written

CARE WORKER SCOPE OF PRACTICE - CRITICAL:
Care workers are NON-CLINICAL support staff. They CANNOT perform clinical assessments.

🔴 NEVER ASK CARE WORKERS TO:
- Check breathing, respiration, pulse, heart rate, or blood pressure
- Take or record vital signs (temperature, SpO2, oxygen saturation)
- Assess wounds, pressure areas, or skin integrity clinically
- Apply sterile dressings or clinical wound care
- Catheter care, stoma care, PEG feeding, insulin injections
- Make clinical judgments or diagnose conditions
- Manage oxygen equipment or suction airways

🟢 CARE WORKERS CAN:
- Observe and report changes (not assess)
- Assist with personal care, mobility, meals, medication prompting
- Call for help when concerned

⚠️ REWORD CLINICAL OBSERVATIONS AS ESCALATION:
WRONG: "check my breathing" or "monitor respiration"
RIGHT: "If I appear unusually breathless or struggling to breathe, call 999 immediately"

WRONG: "observe wound healing"
RIGHT: "District Nurse manages my dressing. Report any redness, leaking, or odour to District Nurse"

EXAMPLE QUALITY (Morning call - 250 words):
"I like to wake up naturally around 8am - please knock gently and wait for my response before entering. I need support to sit up in bed using the bed rail on my right side. My morning routine starts with toileting - I can walk to the bathroom with my walking frame but need supervision for safety as I had a fall last year. I prefer a wash at the sink rather than a shower on morning calls. Please help me wash my upper body and back as I struggle to reach. I like the water warm but not too hot. After washing I need help drying thoroughly, especially between my toes as I have diabetes and poor circulation. For dressing I prefer comfortable loose clothing - my clothes are laid out in the wardrobe. I can manage my upper body but need full assistance with lower body dressing due to my hip arthritis. Please help me put on my compression stockings - left leg first as this is weaker. I take 3 medications at breakfast time which are in the dosette box in the kitchen. I need prompting but can take them myself with a glass of water. For breakfast I like porridge made with semi-skimmed milk and a mug of tea with one sugar. Please ensure I eat and drink as I sometimes forget. Before leaving please check I have my call pendant on and my mobile phone is within reach."

✓ This example shows: specific times (8am), named equipment (walking frame, bed rail, dosette box), safety notes (fall last year), dignity maintained, clear preferences (porridge, warm water), step-by-step routine, medical conditions context (diabetes, arthritis)

✗ BAD EXAMPLE - TOO VAGUE:
"I need help in the morning. Staff should assist me with personal care and give me breakfast. I take medications. Please make sure I'm safe and comfortable."

✗ Avoid vague phrases: "assist as needed", "provide support", "ensure comfort", "appropriate care" - be SPECIFIC

OUTPUT FORMAT - Return ONLY valid JSON:
{
  "content": "Detailed first-person narrative (450+ words minimum) covering ALL aspects of care for this call type in one flowing paragraph"
}`;

      sendProgress(10, "Generating care plan...", "generating");

      const toStringSafe = (value: unknown) =>
        typeof value === "string" ? value : value == null ? "" : String(value);
      const scrubText = (value: unknown) => sanitizeNarrativePII(toStringSafe(value));
      const viewText = (value: unknown) => allowSensitiveView ? toStringSafe(value) : scrubText(value);

      // Scrub PII using vault - original values stored locally for restoration
      const documentContentForAi = piiVault.scrub(documentContent);
      const vaultStats = piiVault.getStats();
      console.log(`[CarePlan] PII Vault: Scrubbed ${vaultStats.total} sensitive items (${Object.entries(vaultStats.byCategory).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(', ')})`);
      piiVault.logAudit('SCRUB', '/api/ai/generate-care-plan', aiUserContext.userId, aiUserContext.username);

      sendProgress(20, `Generating ${callTypeLabel} care plan...`, "generating");
      console.log(`[CarePlan] Generating ${callTypeLabel} care plan`);

      if (!isAIEnabled()) {
        sendProgress(60, "Using secure rule-based care plan generator...", "rule_based");
        const fallbackRaw = buildRuleBasedCarePlanPayload({
          documentContent: documentContentForAi,
          serviceUserInitials,
          callType: callTypeLabel,
        });
        const templateContent = piiVault.toPlaceholders(fallbackRaw.content);
        // Always export vault for automatic name restoration
        const vaultExport = piiVault.export();
        const result = {
          ...fallbackRaw,
          content: templateContent,
          vaultExport,
          rawWithTokens: fallbackRaw,
        };
        piiVault.logAudit('RESTORE', '/api/ai/generate-care-plan', aiUserContext.userId, aiUserContext.username);
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', result);
        piiVault.clear();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      // ════════════════════════════════════════════════════════════════════
      // DEBUG: LOG COMPLETE AI INPUT - CARE PLAN GENERATION
      // ════════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('📋 CARE PLAN AI INPUT - CONTENT SENT TO AI');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log(`Call Type: ${callTypeLabel}`);
      console.log(`Model: ${getAccurateModel()}`);
      console.log(`Date: ${today}`);
      console.log('');
      
      const carePlanUserContent = `Generate a comprehensive ${callTypeLabel} care plan following CQC 2024 person-centred standards.\n\n═══════════════════════════════════════════════════════════════════════════════\nSERVICE USER DOCUMENTS\n═══════════════════════════════════════════════════════════════════════════════\n${documentContentForAi}`;
      
      console.log('📊 CONTENT STATS:');
      console.log(`   Document Content Length: ${documentContentForAi.length.toLocaleString()} chars`);
      console.log(`   Total User Content: ${carePlanUserContent.length.toLocaleString()} chars`);
      console.log(`   Policy Context Length: ${policyContext.length.toLocaleString()} chars`);
      console.log(`   Number of Mandatory Sections: ${mandatorySections.length}`);
      console.log('');
      
      console.log('📄 DOCUMENT CONTENT PREVIEW (First 2000 characters):');
      console.log('─────────────────────────────────────────────────────────────────');
      console.log(documentContentForAi.substring(0, 2000));
      if (documentContentForAi.length > 2000) {
        console.log(`\n... [${(documentContentForAi.length - 2000).toLocaleString()} more characters] ...\n`);
      }
      console.log('─────────────────────────────────────────────────────────────────');
      console.log('');
      
      console.log('📋 MANDATORY SECTIONS TO GENERATE:');
      mandatorySections.forEach((section, idx) => {
        console.log(`   ${idx + 1}. ${section.title} (${section.priority} priority)`);
      });
      console.log('');
      
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('\n');

      // Simulated progress during AI call
      let simulatedProgress = 20;
      progressInterval = setInterval(() => {
        if (simulatedProgress < 75) {
          simulatedProgress += 5;
          const messages = [
            `Analyzing documents for ${callTypeLabel} call...`,
            "Building person-centred care content...",
            "Extracting preferences and routines...",
            "Ensuring safety considerations...",
            "Formatting care plan structure...",
            "Finalizing comprehensive plan...",
          ];
          const msgIndex = Math.floor((simulatedProgress - 20) / 10) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "generating");
        }
      }, 3000);

      try {
        const response = await executeSecureTextCompletion({
          endpoint: "/api/ai/generate-care-plan",
          feature: "care_plan_calltype",
          model: getAccurateModel(),
          userContext: aiUserContext,
          inputText: `Generate a comprehensive ${callTypeLabel} care plan following CQC 2024 person-centred standards.

═══════════════════════════════════════════════════════════════════════════════
SERVICE USER DOCUMENTS
═══════════════════════════════════════════════════════════════════════════════

${documentContentForAi}

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════════════════

1. Read ALL the documents thoroughly
2. Extract information relevant to ${callTypeLabel} calls ONLY
3. Write in FIRST PERSON as if I am describing my own care needs
4. Be SPECIFIC: times, preferences, equipment, step-by-step routines
5. Include safety considerations and dignity throughout
6. Minimum 450 words - comprehensive detail is essential
7. Write as ONE flowing paragraph (not bullet points)

QUALITY CHECKLIST:
✓ Written in first person (I, my, me)?
✓ Specific times and preferences included?
✓ Equipment and assistance levels detailed?
✓ Safety considerations mentioned?
✓ Dignity and respect maintained?
✓ Focused ONLY on ${callTypeLabel} tasks?
✓ Actionable - carers know exactly what to do?
✓ Minimum 450 words of comprehensive detail?

Return ONLY valid JSON with content field.`,
          systemPrompt: baseSystemPrompt,
          temperature: 0.1,
          maxCompletionTokens: 3000,
          seed: 42,
          responseFormat: { type: "json_object" },
          useCache: false,
        });

        if (progressInterval) clearInterval(progressInterval);
        const content = response.restoredText || "";
        const parsed = parseJsonFromContent(content);
        
        if (!parsed || !parsed.content) {
          sendEvent('error', { message: "Failed to generate care plan content" });
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          return res.end();
        }

        let enhancedContent = parsed.content || "";
        const getContentStats = (text: string) => {
          const words = text.split(/\s+/).filter(Boolean);
          const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
          return {
            wordCount: words.length,
            sentenceCount: sentences.length,
            avgWordsPerSentence: sentences.length > 0 ? words.length / sentences.length : 0,
          };
        };

        let { wordCount, sentenceCount, avgWordsPerSentence } = getContentStats(enhancedContent);
        if (wordCount < 450) {
          sendProgress(82, "Expanding with more person-centred detail...", "refining");
          try {
            const refineResponse = await executeSecureTextCompletion({
              endpoint: "/api/ai/generate-care-plan",
              feature: "care_plan_calltype_refine",
              model: getAccurateModel(),
              userContext: aiUserContext,
              inputText: `Expand and enrich the care plan below to at least 450 words. Keep it in first person, include routines, preferences, what matters to me, communication style, emotional support needs, triggers, equipment and safety. Do NOT add facts beyond the documents. Keep it as one flowing paragraph.\n\nDOCUMENTS (REFERENCE ONLY, DO NOT QUOTE VERBATIM):\n${documentContentForAi}\n\nDRAFT CARE PLAN TO EXPAND:\n${enhancedContent}\n\nReturn ONLY valid JSON with content field.`,
              systemPrompt: baseSystemPrompt,
              temperature: 0.1,
              maxCompletionTokens: 2400,
              seed: 42,
              responseFormat: { type: "json_object" },
              useCache: false,
            });

            const refinedContent = refineResponse.restoredText || "";
            const refinedParsed = parseJsonFromContent(refinedContent);
            if (refinedParsed?.content && refinedParsed.content.length > enhancedContent.length) {
              enhancedContent = refinedParsed.content;
            }
          } catch (refineError: any) {
            console.warn("[CarePlan] Refinement pass failed:", refineError?.message || refineError);
          }
        }

        ({ wordCount, sentenceCount, avgWordsPerSentence } = getContentStats(enhancedContent));
        
        // Comprehensive Quality Validation
        
        console.log(`[CarePlan] Generated ${wordCount} words, ${sentenceCount} sentences for ${callTypeLabel} plan`);
        
        // Length check
        if (wordCount < 200) {
          console.warn(`[CarePlan] ⚠️  Content too short (${wordCount} words, minimum 450 recommended)`);
        } else if (wordCount < 350) {
          console.log(`[CarePlan] ⚠️  Content adequate but could be more detailed (${wordCount} words)`);
        } else {
          console.log(`[CarePlan] ✅ Content length good (${wordCount} words)`);
        }
        
        // Readability scoring (aim for 15-25 words per sentence for care plans)
        if (avgWordsPerSentence > 35) {
          console.warn(`[CarePlan] ⚠️  Sentences too long (avg ${avgWordsPerSentence.toFixed(1)} words) - may be hard to read`);
        } else if (avgWordsPerSentence > 0 && avgWordsPerSentence < 10) {
          console.warn(`[CarePlan] ⚠️  Sentences very short (avg ${avgWordsPerSentence.toFixed(1)} words) - may lack detail`);
        } else if (avgWordsPerSentence > 0) {
          console.log(`[CarePlan] ✅ Readability good (avg ${avgWordsPerSentence.toFixed(1)} words/sentence)`);
        }
        
        // Safety keyword check
        const contentLower = enhancedContent.toLowerCase();
        const safetyTerms = ['safety', 'risk', 'danger', 'emergency', 'fall', 'choking', 'allergic'];
        const hasSafetyContent = safetyTerms.some(term => contentLower.includes(term));
        if (!hasSafetyContent && callType !== 'Domestic') {
          console.warn(`[CarePlan] ⚠️  No safety considerations mentioned (should include risks/precautions)`);
        }
        
        // Equipment mention check
        const equipmentTerms = ['hoist', 'frame', 'wheelchair', 'walker', 'zimmer', 'stick', 'aid', 'equipment'];
        const mentionsEquipment = equipmentTerms.some(term => contentLower.includes(term));
        if (mentionsEquipment) {
          // Check if usage is explained
          const hasUsageExplanation = contentLower.includes('use') || contentLower.includes('using') || 
                                       contentLower.includes('assist') || contentLower.includes('help');
          if (!hasUsageExplanation) {
            console.warn(`[CarePlan] ⚠️  Equipment mentioned but usage not clearly explained`);
          }
        }
        
        // Missing information detection
        const missingInfoPhrases = [
          'ask me about', 'information not found', 'not specified', 'details unclear',
          'preferences not stated', 'not documented', 'check with'
        ];
        const hasMissingInfo = missingInfoPhrases.some(phrase => contentLower.includes(phrase));
        if (hasMissingInfo) {
          console.log(`[CarePlan] ℹ️  Plan includes prompts for missing information (good practice)`);
        }
        
        // Ensure first-person perspective
        if (!enhancedContent.includes("I ") && !enhancedContent.includes("my ")) {
          console.log(`[CarePlan] Converting to first person`);
          enhancedContent = enhancedContent.replace(/The (client|service user|patient)/gi, "I");
          enhancedContent = enhancedContent.replace(/Staff should/gi, "I need my carers to");
          enhancedContent = enhancedContent.replace(/\b(He|She)\b/gi, "I");
          enhancedContent = enhancedContent.replace(/\b(his|her)\b/gi, "my");
        }
        
        // Enhanced call type relevance validation
        if (callType) {
          const wrongCallTypeTerms: Record<string, string[]> = {
            'Morning': ['bedtime', 'night medication', 'night routine', 'prepare for sleep', 'going to bed'],
            'Bed': ['breakfast', 'waking up', 'morning routine', 'morning medication', 'morning wash'],
            'Domestic': ['personal care', 'washing', 'dressing', 'medication', 'toileting', 'continence'],
            'Lunch': ['breakfast', 'bedtime', 'night routine', 'waking'],
            'Tea': ['breakfast', 'waking up', 'bedtime', 'night'],
          };
          
          const wrongTerms = wrongCallTypeTerms[callType] || [];
          const foundWrongTerms = wrongTerms.filter(term => 
            contentLower.includes(term.toLowerCase())
          );
          
          if (foundWrongTerms.length > 0) {
            console.warn(`[CarePlan] ❌ ${callType} plan contains terms from other call types: ${foundWrongTerms.join(', ')}`);
          }
          
          // Check for expected call-type content
          const expectedTerms: Record<string, string[]> = {
            'Morning': ['wash', 'dress', 'breakfast', 'wake', 'routine'],
            'Bed': ['night', 'sleep', 'evening', 'bedtime', 'rest'],
            'Domestic': ['clean', 'tidy', 'laundry', 'shopping', 'household'],
            'Lunch': ['lunch', 'meal', 'eat', 'drink', 'food'],
            'Tea': ['tea', 'snack', 'evening', 'afternoon'],
          };
          
          const expected = expectedTerms[callType] || [];
          const hasExpectedContent = expected.some(term => contentLower.includes(term));
          
          if (!hasExpectedContent && expected.length > 0) {
            console.warn(`[CarePlan] ⚠️  ${callType} plan missing expected content keywords`);
          } else {
            console.log(`[CarePlan] ✅ ${callType} plan contains appropriate call-type content`);
          }
        }

        const today = new Date().toLocaleDateString("en-GB");
        
        // Template-Only AI: Convert tokens to readable placeholders (no PII in output)
        // Output is GDPR-exempt as it contains no personal data
        const templateContent = piiVault.toPlaceholders(enhancedContent);
        console.log(`[CarePlan] Template Output: ${piiVault.getStats().total} fields converted to placeholders like [Name], [Date of Birth]`);
        piiVault.logAudit('SCRUB', '/api/ai/generate-care-plan', aiUserContext.userId, aiUserContext.username);
        
        // Base result with placeholders
        let result: any = {
          serviceUserInitials: normalizeInitials(serviceUserInitials || 'N.N.'),
          generatedDate: today,
          callType: callTypeLabel,
          content: templateContent,
        };
        
        // For authorized admin users with allowSensitive, include vault export for client-side restoration
        // Always export vault for automatic client-side name restoration
        const vaultExport = piiVault.export();
        result = {
          ...result,
          vaultExport,
          rawWithTokens: {
            serviceUserInitials: normalizeInitials(serviceUserInitials || 'N.N.'),
            generatedDate: today,
            callType: callTypeLabel,
            content: enhancedContent,
          },
        };
        console.log(`[CarePlan] Including vault export with ${vaultExport.mapping ? Object.keys(vaultExport.mapping).length : 0} tokens for automatic local restoration`);
        piiVault.logAudit('RESTORE', '/api/ai/generate-care-plan', aiUserContext.userId, aiUserContext.username);

        sendProgress(100, "Complete!", "complete");
        sendEvent('result', result);
        
        // Clear vault after use (security best practice)
        piiVault.clear();
        
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
        
      } catch (genError: any) {
        console.error("[CarePlan] Generation error:", genError.message);
        piiVault.clear(); // Clear vault on error too
        sendEvent('error', { message: safeErrorMessage(genError, "AI generation failed") });
        if (progressInterval) clearInterval(progressInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
      
    } catch (error: any) {
      console.error("Care Plan Generation Error:", error);
      piiVault.clear(); // Clear vault on error too
      if (progressInterval) clearInterval(progressInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: safeErrorMessage(error, "AI generation failed") })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ message: safeErrorMessage(error, "AI generation failed") });
    }
  });

  // Enhance existing care plan - generates complete care plan template matching exact form structure
  app.post("/api/ai/enhance-plan", requireAuth, async (req: any, res) => {
    // Token estimation helper (rough: ~4 chars per token)
    const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
    
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    // PII Vault for reversible scrubbing - keeps sensitive data local
    const piiVault = new PIIVault();
    
    try {
      const { documentContent, existingPlanContent, allowSensitive } = req.body;
      const allowSensitiveView = Boolean(allowSensitive) && req.user?.role === "admin";
      
      const documentText = typeof documentContent === "string" ? documentContent.trim() : "";
      const existingPlanText = typeof existingPlanContent === "string" ? existingPlanContent.trim() : "";

      if (!documentText && !existingPlanText) {
        return res.status(400).json({ message: "Document content or existing plan required" });
      }

      // Set up SSE for progress streaming with production-safe settings
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const corsOrigin = process.env.CORS_ORIGIN;
      if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.flushHeaders();

      // Small delay to ensure headers are flushed through proxies
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send initial ping to establish connection
      res.write(`: ping\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();

      // Heartbeat to keep connection alive during long AI processing
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 10000);

      const sendEvent = (eventType: string, data: any) => {
        try {
          const padding = `: ${'x'.repeat(4096)}\n\n`;
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          res.write(padding + payload);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        } catch (e) {
          console.error('[Enhance SSE] Write error:', e);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      const sendProgress = (percent: number, status: string, stage: string) => {
        console.log(`[Enhance SSE] Progress: ${percent}% - ${status}`);
        sendEvent('progress', { percent, status, stage });
      };

      sendProgress(5, "Initializing...", "init");
      await new Promise(resolve => setTimeout(resolve, 50));
      sendProgress(10, "Preparing documents...", "preparing");

      const rawContentParts: string[] = [];
      if (existingPlanText) {
        rawContentParts.push(`=== EXISTING CARE PLAN (UPLOAD) ===\n${existingPlanText}`);
      }
      if (documentText) {
        rawContentParts.push(`=== SUPPORTING DOCUMENTS AND USER NOTES ===\n${documentText}`);
      }
      const rawContent = rawContentParts.join("\n\n");
      
      // Scrub PII using vault - original values stored locally for restoration
      const contentToEnhance = piiVault.scrub(rawContent);
      const vaultStats = piiVault.getStats();
      console.log(`[Enhance] PII Vault: Scrubbed ${vaultStats.total} sensitive items (${Object.entries(vaultStats.byCategory).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(', ')})`);
      piiVault.logAudit('SCRUB', '/api/ai/enhance-plan', aiUserContext.userId, aiUserContext.username);
      
      // Estimate initial content tokens
      const contentTokens = estimateTokens(contentToEnhance);
      console.log(`[Enhance] Document content: ~${contentTokens} tokens`);

      if (!isAIEnabled()) {
        sendProgress(35, "Generating secure rule-based template...", "rule_based");
        const fallbackResult = buildRuleBasedPlanEnhancementPayload(contentToEnhance);
        const templateResult = piiVault.toPlaceholders(fallbackResult);
        // Always export vault for automatic client-side name restoration
        // Vault is needed by all authenticated users to restore PII that was scrubbed from AI
        const vaultExport = piiVault.export();
        let payload: any = {
          ...templateResult,
          vaultExport,
          rawWithTokens: fallbackResult,
        };
        piiVault.logAudit('RESTORE', '/api/ai/enhance-plan', aiUserContext.userId, aiUserContext.username);
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', payload);
        piiVault.clear();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const initialAssessmentPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");

      let policyContext = "";
      const allPolicies = [...carePlanPolicies, ...initialAssessmentPolicies, ...scopeOfPracticePolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY DOCUMENTS - FOLLOW THESE AS REFERENCE ===
${initialAssessmentPolicies.map(p => `--- INITIAL ASSESSMENT TEMPLATE: ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}
${carePlanPolicies.map(p => `--- CARE PLAN TEMPLATE: ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}
${scopeOfPracticePolicies.map(p => `--- SCOPE OF PRACTICE: ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}
=== END POLICY DOCUMENTS ===
`;
      }
      
      // Estimate policy context tokens
      const policyTokens = estimateTokens(policyContext);
      console.log(`[Enhance] Policy context: ~${policyTokens} tokens`);

      const privacyDirective = allowSensitiveView
        ? "Privacy: Personal data in documents has been tokenized ({{PII_...}}). Keep tokens in output - they become [Name], [Date of Birth] etc. Never guess real values."
        : "Privacy: Data has been tokenized. Keep tokens in output for automatic placeholder conversion.";

      // Get current provider to determine token limits
      const currentProvider = getPreferredProvider();
      
      // GitHub Models API token limits (from docs: https://docs.github.com/en/github-models)
      // Free tier: High models (GPT-4o) = 8000 in, 4000 out
      // Enterprise tier: 16000 in, 8000 out
      // We'll use conservative 12000 to allow for system prompt overhead
      const MAX_INPUT_TOKENS = currentProvider === "github" ? 12000 : 90000; // OpenAI/Local have higher limits
      
      const systemPromptBase = `You are an expert UK care plan writer (CQC 2024, NHS Person-Centred Care, NICE guidelines). Create a comprehensive, evidence-based care plan from the provided documents. Complete EVERY field - no empty or null values.

${policyContext}

${privacyDirective}
Keep place names and facility names as written.

CARE WORKER SCOPE - This plan is for NON-CLINICAL care workers:
- They CAN: personal care, medication prompting from dosette boxes, mobility assistance, meals, emotional support, light housework, OBSERVE and REPORT changes
- They CANNOT: check vitals, assess wounds, administer injections, make clinical judgments
- For clinical needs, state WHO is responsible (District Nurse, GP), WHEN they visit, WHAT carers should observe/report, and WHEN to call 999
- WRONG: "Care workers should check my breathing" → RIGHT: "If I appear breathless, carers should call 999 immediately"

WRITING RULES:
- ALL content in FIRST PERSON ("I", "my", "me"). Never "the service user" or "the client".
- Use hyphens (-) not dashes. No Oxford commas.
- Sound human, warm and practical - plain English, short-to-medium sentences, no bullet lists in narrative fields.
- Be specific: equipment names, times, quantities, preferences.
- For health conditions: explain what it is, how it affects my daily life, what care workers need to do, warning signs, who to contact.
- NEVER fabricate names, dates, diagnoses, medications, or personal history not in documents.
- Standard care implications for documented conditions ARE acceptable (e.g., "diabetes requires foot checks").
- For missing information: "This information has not been provided in the documents supplied."
- For categorical fields with no evidence: "Not specified in documents provided"
- Cross-reference: if a condition appears anywhere, reference it in ALL related sections.
- Add verificationQuestions for every significant gap.
- Every narrative field should be detailed and thorough - use ALL available evidence from documents.

SECTION WRITING GUIDE - Write comprehensively for each:
- thisIsMe.whoAmI: Flowing life story (aim 400-600 words). Start "My name is [Name]." Cover background, education, work, family, losses, personality, why I need care. Use EVERY biographical detail from documents.
- thisIsMe.hobbiesInterests: Specific hobbies with frequencies, equipment, companions.
- thisIsMe.whatMakesGoodDay: Very specific - routines, activities, people, food, environment I enjoy.
- myCarePlan.healthAndWellbeing: For EACH condition: what it is, how it affects me daily, what care workers do, warning signs, who to contact. This should be the longest section (aim 600-800 words).
- myCarePlan.personalCareNeeds: Full daily routine - morning wash, dressing, oral care, evening routine, continence. Step by step.
- myCarePlan.medicationRequirements: Every medication with name, dose, time, purpose, difficulties.
- myCarePlan.nutrition: Diet type, preferences, allergies, fluid intake, meal times, assistance needed.
- myCarePlan.mobilityAndEquipment: Every piece of equipment, how I move, transfers, distance, stairs.
- myCarePlan.capacityAndSafeguarding: Mental capacity, decision making, safeguarding concerns.`;

      // Calculate total estimated tokens with base system prompt
      const systemPromptTokens = estimateTokens(systemPromptBase);
      const totalEstimatedTokens = systemPromptTokens + policyTokens + contentTokens;
      
      console.log(`[Enhance] Total estimated tokens: ${totalEstimatedTokens} (system: ${systemPromptTokens}, policy: ${policyTokens}, content: ${contentTokens})`);
      console.log(`[Enhance] Provider: ${currentProvider}, Max input tokens: ${MAX_INPUT_TOKENS}`);
      
      let truncationWarning = "";
      let finalContent = contentToEnhance;
      let finalPolicyContext = policyContext;
      
      // If we exceed token limit, intelligently truncate
      if (totalEstimatedTokens > MAX_INPUT_TOKENS) {
        const availableTokens = MAX_INPUT_TOKENS - systemPromptTokens;
        console.warn(`[Enhance] ⚠️ Content exceeds ${MAX_INPUT_TOKENS} token limit. Truncating intelligently...`);
        
        // Priority: Keep user content > policy docs
        // Allocate 70% to content, 30% to policy context
        const contentAllowance = Math.floor(availableTokens * 0.7);
        const policyAllowance = Math.floor(availableTokens * 0.3);
        
        // Truncate content if needed (keep end, as it often has most recent/specific info)
        if (contentTokens > contentAllowance) {
          const contentCharsToKeep = contentAllowance * 4; // ~4 chars per token
          finalContent = "[Content truncated due to size - showing most recent sections]\n\n" + 
                        contentToEnhance.slice(-contentCharsToKeep);
          console.log(`[Enhance] Truncated content from ${contentTokens} to ~${contentAllowance} tokens`);
          truncationWarning = `⚠️ Your uploaded documents were very large (${Math.ceil(contentTokens/1000)}K tokens). Content was automatically truncated to fit within API limits. For best results, consider splitting into smaller documents or summarizing before upload.`;
        }
        
        // Truncate policy context if needed
        if (policyTokens > policyAllowance) {
          const policyCharsToKeep = policyAllowance * 4;
          finalPolicyContext = policyContext.slice(0, policyCharsToKeep) + "\n[Policy documents truncated due to size]\n";
          console.log(`[Enhance] Truncated policy from ${policyTokens} to ~${policyAllowance} tokens`);
        }
        
        sendProgress(15, truncationWarning ? "Large documents detected - optimizing..." : "Processing...", "preparing");
      }

      const systemPrompt = systemPromptBase + `
${finalPolicyContext}

Return ONLY valid JSON matching this exact schema. For categorical fields use EXACTLY the allowed values shown.

{
  "verificationQuestions": ["Specific question about missing info"],
  "thisIsMe": {
    "whoAmI": "Life story starting 'My name is [Name].' - aim 400-600 words",
    "hobbiesInterests": "Detailed hobbies and interests",
    "whatMakesGoodDay": "Specific description of a good day"
  },
  "goalSetting": {
    "goals": [{"goal": "Goal", "howToAchieve": "How", "potentialBarriers": "Barriers", "timeFrame": "6 months"}],
    "internetSupport": "Yes/No and details",
    "assistiveTechnology": "Technology in use or needed"
  },
  "advanceDecisions": {
    "advanceDecisionInPlace": "Yes/No",
    "dnrDetails": "DNR or advance decision details",
    "lastingPOA": "Yes/No",
    "poaType": "Health/Finance/Both",
    "poaContact": "Contact details"
  },
  "myCarePlan": {
    "capacityAndSafeguarding": "Mental capacity assessment in first person",
    "healthAndWellbeing": "EVERY health condition: what it is, how it affects me, what care workers do, warning signs, who to contact",
    "triggerPoints": "Signs indicating health changes - be specific",
    "medicationRequirements": "Every medication with name, dose, time, purpose, side effects, difficulties",
    "nutrition": "Diet type, preferences, allergies, fluid intake, meal times, assistance needed",
    "personalCareNeeds": "Full daily routine: morning wash, dressing, oral care, evening, continence",
    "mobilityAndEquipment": "Every piece of equipment, how I move, transfers, distance, stairs",
    "houseworkAndSocial": "Housework support and social needs in detail",
    "financialArrangements": "Finance management details"
  },
  "riskSection1Health": {
    "speech": "EXACTLY ONE OF: Good / Fair / Very Poor / Severe Loss",
    "speechDetails": "Details of speech and any devices used",
    "hearing": "EXACTLY ONE OF: Good / Fair / Very Poor / Severe Loss",
    "hearingDetails": "Hearing details and any aids used",
    "eyesight": "EXACTLY ONE OF: Good / Fair / Very Poor / Severe Loss",
    "eyesightDetails": "Eyesight details and any glasses/aids used",
    "breathlessness": "EXACTLY ONE OF: Independent / Use of Resources",
    "breathlessnessDetails": "Breathing details and resources used",
    "urinaryIncontinence": "EXACTLY ONE OF: Independent / Use of Resources",
    "urinaryDetails": "Continence details and resources used",
    "faecalIncontinence": "EXACTLY ONE OF: Independent / Use of Resources",
    "faecalDetails": "Details and resources used",
    "memory": "EXACTLY ONE OF: Good / Forgetful / Very Poor / Severe Loss",
    "moods": "EXACTLY ONE OF: Stable / Anxious / Depressed / Unstable",
    "orientation": "EXACTLY ONE OF: Full / Not always / Unaware / Disoriented",
    "sleepPattern": "EXACTLY ONE OF: Good / Fair / Wakes often / Sleeps little",
    "behaviours": "EXACTLY ONE OF: Good / Uncooperative / Unpredictable / Aggressive",
    "understandsInfo": "EXACTLY ONE OF: Yes / Partially / No",
    "retainsInfo": "EXACTLY ONE OF: Yes / Partially / No",
    "weighsDecision": "EXACTLY ONE OF: Yes / Partially / No",
    "communicatesDecision": "EXACTLY ONE OF: Yes / Partially / No",
    "capacityDetails": "Capacity assessment details",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention measures"
  },
  "riskSection2Medication": {
    "prescriptionOrdering": "Who orders prescriptions",
    "dosageSystem": "Blister pack/Dosette/Original packaging",
    "systemMaintainer": "Who maintains system",
    "medicationStorage": "Where stored",
    "currentInvestigations": "Ongoing treatments",
    "surplusMedication": "Yes/No surplus",
    "medicationConcerns": "Any concerns",
    "homeopathicMeds": "Herbal/OTC medications",
    "prnMedication": "EXACTLY ONE OF: Yes / No / N/A",
    "covertMedication": "EXACTLY ONE OF: Yes / No",
    "pickingUpTablets": "EXACTLY ONE OF: YES / NO / N/A",
    "openingBoxes": "EXACTLY ONE OF: YES / NO / N/A",
    "pouringLiquids": "EXACTLY ONE OF: YES / NO / N/A",
    "usingDosageSystem": "EXACTLY ONE OF: YES / NO / N/A",
    "applyingCreams": "EXACTLY ONE OF: YES / NO / N/A",
    "swallowingTablets": "EXACTLY ONE OF: YES / NO / N/A",
    "understandingInstructions": "EXACTLY ONE OF: YES / NO / N/A",
    "managingInhalers": "EXACTLY ONE OF: YES / NO / N/A",
    "instillingDrops": "EXACTLY ONE OF: YES / NO / N/A",
    "controlledDrugs": "Details if any",
    "warfarin": "Details if applicable",
    "skinIntegrity": "EXACTLY ONE OF: Yes / No",
    "skinDetails": "Skin concerns and actions taken",
    "pictureConsent": "EXACTLY ONE OF: Yes / No",
    "bodyMapCompleted": "EXACTLY ONE OF: Yes / No",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention measures"
  },
  "riskSection3Nutrition": {
    "mealAssistance": "EXACTLY ONE OF: Yes / No",
    "normalDiet": "EXACTLY ONE OF: Yes / No",
    "normalDietDetails": "Normal diet details if Yes",
    "specialDietary": "EXACTLY ONE OF: Yes / No",
    "specialDietaryDetails": "Special requirements details if Yes",
    "foodAllergies": "EXACTLY ONE OF: Yes / No",
    "foodAllergiesDetails": "Allergy details if Yes",
    "softDiet": "EXACTLY ONE OF: Yes / No",
    "softDietDetails": "Soft diet details if Yes",
    "foodIntolerances": "EXACTLY ONE OF: Yes / No",
    "foodIntolerancesDetails": "Intolerance details if Yes",
    "tubeFeed": "EXACTLY ONE OF: Yes / No",
    "tubeFeedDetails": "Tube feed details if Yes",
    "supplementaryFoods": "EXACTLY ONE OF: Yes / No",
    "supplementaryFoodsDetails": "Thickeners/supplements details if Yes",
    "foodLikes": "Foods I like",
    "foodDislikes": "Foods I dislike",
    "portionSize": "Portion preferences",
    "mainMealTime": "Preferred meal time",
    "fluidIntake": "Fluid preferences",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention measures"
  },
  "riskSection4Equipment": {
    "equipment": [{"name": "Equipment", "fitForPurpose": "EXACTLY ONE OF: Yes / No", "supplier": "Name", "nextService": "Date"}],
    "remedialAction": "Safety measures",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention measures"
  },
  "riskSection5Mobility": {
    "weightBearing": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "weightBearingDetails": "Details",
    "walking": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "walkingDetails": "Walking details",
    "stairs": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / No steps/stairs",
    "stairsDetails": "Stairs details",
    "sitToStand": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "sitToStandDetails": "Details",
    "washing": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "washingDetails": "Washing support details",
    "dressing": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "dressingDetails": "Dressing details",
    "oralCare": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "oralCareDetails": "Oral care details",
    "bathShower": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "bathShowerDetails": "Bath/Shower preference and support details",
    "toiletCommode": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "toiletCommodeDetails": "Toilet support details",
    "wheelchair": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "wheelchairDetails": "Wheelchair details",
    "transfers": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "transfersDetails": "How I transfer details",
    "moveInBed": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "moveInBedDetails": "Bed mobility details",
    "inOutOfBed": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "inOutOfBedDetails": "Bed transfers details",
    "chairToWheelchair": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "chairToWheelchairDetails": "Chair to wheelchair transfer details",
    "inOutOfCar": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "inOutOfCarDetails": "Car transfer details",
    "otherTransfers": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "otherTransfersDetails": "Other transfer details",
    "communityAccess": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "communityAccessDetails": "Community access details",
    "specialistEquipment": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "specialistEquipmentDetails": "Specialist equipment details",
    "canBeLeftAlone": "EXACTLY ONE OF: Always / Long Period / Short Period / Not at all",
    "canBeLeftAloneDetails": "Details about being left alone",
    "proneToFalls": "EXACTLY ONE OF: Never / Occasionally / Often / Frequent",
    "proneToFallsDetails": "Falls history and details",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention measures"
  },
  "riskSection6Appliances": {
    "cooker": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "microwave": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "iron": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "kettle": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "toaster": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "tumbleDryer": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "floorCoverings": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "handRails": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "electricBlanket": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "bed": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "washingMachine": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "centralHeating": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "actionsRequired": "Actions needed"
  },
  "riskSection7Fire": {
    "atRisk": "EXACTLY ONE OF: Yes / No",
    "riskReasons": ["ARRAY of applicable reasons from: Smoking, Cooking, Hoarding, Lighter Fuel, Open Fire, Free standing heaters, Paraffin-based emollients, Oxygen, Candles, Other"],
    "ragRating": "EXACTLY ONE OF: Red / Amber / Green",
    "plugSockets": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "electricCables": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "smokingPolicy": "EXACTLY ONE OF: Yes / No",
    "smokeAlarmLocation": "Location text",
    "smokeAlarmWorking": "EXACTLY ONE OF: Yes / No",
    "coDetectorLocation": "CO detector location text",
    "coDetectorWorking": "EXACTLY ONE OF: Yes / No",
    "actionsTaken": "EXACTLY ONE OF: Referral made to Fire Service / Social Services / No Actions Required / Other",
    "actionsDetails": "Details of actions taken and safety measures",
    "canEvacuate": "Can evacuate without assistance details"
  },
  "riskSection8COSHH": {
    "cleaningStorage": "Where cleaning materials stored",
    "riddorExplained": "Yes/No"
  },
  "riskSection9External": {
    "access": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "accessLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "clearPathways": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "clearPathwaysLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "handrails": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "handrailsLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "entranceSteps": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "entranceStepsLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "lighting": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "lightingLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "ramps": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "rampsLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "personalSecurity": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "personalSecurityLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "parking": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "parkingLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "actionsRequired": "Actions needed",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention"
  },
  "riskSection10Security": {
    "meansOfAccess": "EXACTLY ONE OF: Key safe / Key held / Other",
    "propertyType": "EXACTLY ONE OF: House / Flat / Bungalow / Other",
    "enterUsing": "EXACTLY ONE OF: Front door / Side door / Back door / Other",
    "keysafeConsent": "EXACTLY ONE OF: Yes / No",
    "gasShutOff": "Location text",
    "stopTap": "Location text",
    "fuseBox": "Location text",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention"
  },
  "section11Bands": {
    "personalCare": "Yes/No",
    "mentalHealth": "Yes/No",
    "physicalDisability": "Yes/No",
    "dementia": "Yes/No",
    "eatingDisorder": "Yes/No",
    "sensoryImpairment": "Yes/No",
    "detainedMHA": "Yes/No",
    "drugAlcoholMisuse": "Yes/No",
    "learningDifficulties": "Yes/No"
  }
}`;

      sendProgress(25, "Generating enhanced plan...", "ai_generation");

      // ════════════════════════════════════════════════════════════════════
      // DEBUG: LOG COMPLETE AI INPUT - WHAT THE AI ACTUALLY RECEIVES
      // ════════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('📋 AI INPUT ANALYSIS - CONTENT SENT TO AI FOR GENERATION');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log(`Provider: ${currentProvider}`);
      console.log(`Model: ${getRiskAssessmentGenerationModel()}`);
      console.log(`Max Input Tokens: ${MAX_INPUT_TOKENS}`);
      console.log('');
      
      // Show raw content stats before truncation
      console.log('📊 RAW CONTENT STATS (Before Truncation):');
      console.log(`   Total Characters: ${contentToEnhance.length.toLocaleString()}`);
      console.log(`   Estimated Tokens: ${contentTokens.toLocaleString()}`);
      console.log(`   Policy Tokens: ${policyTokens.toLocaleString()}`);
      console.log(`   System Prompt Tokens: ${systemPromptTokens.toLocaleString()}`);
      console.log(`   Total Estimated: ${totalEstimatedTokens.toLocaleString()}`);
      console.log('');
      
      // Show what was actually sent after truncation
      const finalContentTokens = estimateTokens(finalContent);
      const finalPolicyTokens = estimateTokens(finalPolicyContext);
      const finalSystemTokens = estimateTokens(systemPrompt);
      console.log('📤 FINAL CONTENT SENT TO AI (After Truncation):');
      console.log(`   Final Content Tokens: ${finalContentTokens.toLocaleString()}`);
      console.log(`   Final Policy Tokens: ${finalPolicyTokens.toLocaleString()}`);
      console.log(`   Final System Tokens: ${finalSystemTokens.toLocaleString()}`);
      console.log(`   Total Input Tokens: ${(finalContentTokens + finalPolicyTokens + finalSystemTokens).toLocaleString()}`);
      console.log(`   Truncation Applied: ${totalEstimatedTokens > MAX_INPUT_TOKENS ? 'YES ✂️' : 'NO ✅'}`);
      console.log('');
      
      // Show actual content preview (first 2000 chars)
      console.log('📄 CONTENT PREVIEW (First 2000 characters):');
      console.log('─────────────────────────────────────────────────────────────────');
      console.log(finalContent.substring(0, 2000));
      if (finalContent.length > 2000) {
        console.log(`\n... [${(finalContent.length - 2000).toLocaleString()} more characters] ...\n`);
      }
      console.log('─────────────────────────────────────────────────────────────────');
      console.log('');
      
      // If truncated, show what was cut
      if (totalEstimatedTokens > MAX_INPUT_TOKENS) {
        const contentCutChars = contentToEnhance.length - finalContent.length;
        const contentCutTokens = contentTokens - finalContentTokens;
        console.log('✂️  TRUNCATION SUMMARY:');
        console.log(`   Characters Removed: ${contentCutChars.toLocaleString()}`);
        console.log(`   Tokens Removed: ${contentCutTokens.toLocaleString()}`);
        console.log(`   Percentage Kept: ${Math.round((finalContentTokens / contentTokens) * 100)}%`);
        console.log(`   Truncation Strategy: Keep end of content (most recent/specific info)`);
        console.log('');
      }
      
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('\n');

      // Simulated progress during AI call — covers up to ~5 minutes of AI processing
      let simulatedProgress = 25;
      progressInterval = setInterval(() => {
        if (simulatedProgress < 70) {
          // Slow, steady increments (~45 ticks × 6s = 4.5 min to reach 70)
          simulatedProgress += 1;
          const messages = [
            "Analyzing document content...",
            "Generating personal profile...",
            "Creating care plan sections...",
            "Writing health assessments...",
            "Building risk evaluations...",
            "Compiling care requirements...",
            "Cross-referencing sections...",
            "Applying quality standards...",
            "Finalizing plan content...",
          ];
          const msgIndex = Math.floor((simulatedProgress - 25) / 5) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "ai_generation");
        }
      }, 6000);

      const response = await executeSecureTextCompletion({
        endpoint: "/api/ai/enhance-plan",
        feature: "plan_enhancer",
        model: getRiskAssessmentGenerationModel(),
        userContext: aiUserContext,
        inputText: `Generate a comprehensive care plan from these documents. Write detailed, thorough content for EVERY field - especially thisIsMe.whoAmI (full life story), healthAndWellbeing (every condition explained), and personalCareNeeds (full daily routine). Use ALL available evidence. Cross-reference conditions across sections.

DOCUMENTS:

${finalContent}

Return ONLY valid JSON matching the schema.`,
        systemPrompt,
        temperature: 0,
        seed: 42,
        maxCompletionTokens: currentProvider === "github" ? 8000 : 32000,
        responseFormat: { type: "json_object" },
        useCache: false,
      });

      clearInterval(progressInterval);

      // ── Check for token-limit truncation ──
      const finishReason = response.finishReason;
      const contentLength = response.restoredText?.length || 0;
      console.log(`[PlanEnhancer] finish_reason=${finishReason}, content_length=${contentLength}`);

      if (finishReason === "length") {
        console.warn('[PlanEnhancer] ⚠️  AI response was TRUNCATED (finish_reason=length). Output will be incomplete.');
        console.warn(`[PlanEnhancer] Content length: ${contentLength} chars. Consider reducing prompt size or increasing max_completion_tokens.`);
      }

      sendProgress(75, "Processing results...", "processing");

      const content = response.restoredText || "";
      let result = parseJsonFromContent(content);
      if (result) {
        const normalizeFirstPerson = (value: unknown): unknown => {
          if (typeof value !== "string") return value;
          let updated = toFirstPerson(value.trim());
          const verbMap: Record<string, string> = {
            requires: "require",
            needs: "need",
            has: "have",
            prefers: "prefer",
            likes: "like",
            enjoys: "enjoy",
            wants: "want",
            "would like": "would like",
            is: "am",
            was: "was",
          };
          updated = updated.replace(/^\s*(requires|needs|has|prefers|likes|enjoys|wants|would like|is|was)\b/i, (match) => {
            const key = match.trim().toLowerCase();
            const mapped = verbMap[key] || match.trim();
            return `I ${mapped}`;
          });
          return updated;
        };
        const applyFirstPersonPath = (path: string) => {
          const parts = path.split(".");
          let target: any = result;
          for (let i = 0; i < parts.length - 1; i += 1) {
            if (!target || typeof target !== "object") return;
            target = target[parts[i]];
          }
          const key = parts[parts.length - 1];
          if (target && typeof target[key] === "string") {
            target[key] = normalizeFirstPerson(target[key]);
          }
        };
        const narrativePaths = [
          "thisIsMe.whoAmI",
          "thisIsMe.hobbiesInterests",
          "thisIsMe.whatMakesGoodDay",
          "myCarePlan.capacityAndSafeguarding",
          "myCarePlan.healthAndWellbeing",
          "myCarePlan.triggerPoints",
          "myCarePlan.medicationRequirements",
          "myCarePlan.nutrition",
          "myCarePlan.personalCareNeeds",
          "myCarePlan.mobilityAndEquipment",
          "myCarePlan.houseworkAndSocial",
          "myCarePlan.financialArrangements",
        ];
        narrativePaths.forEach(applyFirstPersonPath);
        if (Array.isArray(result.goalSetting?.goals)) {
          result.goalSetting.goals = result.goalSetting.goals.map((goal: any) => ({
            ...goal,
            goal: normalizeFirstPerson(goal?.goal),
            howToAchieve: normalizeFirstPerson(goal?.howToAchieve),
            potentialBarriers: normalizeFirstPerson(goal?.potentialBarriers),
          }));
        }

        // Validate and auto-correct categorical field values
        console.log('[PlanEnhancer] ───────────────────────────────────────────────────');
        console.log('[PlanEnhancer] SCHEMA VALIDATION');
        console.log('[PlanEnhancer] ───────────────────────────────────────────────────');
        
        const { corrected, corrections } = autoCorrectPlanEnhancerResponse(result);
        if (corrections.length > 0) {
          console.log(`[PlanEnhancer] ✅ Auto-corrected ${corrections.length} case mismatches:`);
          corrections.forEach(fix => {
            console.log(`[PlanEnhancer]    ${fix}`);
          });
          result = corrected;
        } else {
          console.log('[PlanEnhancer] ✅ No case corrections needed');
        }
        
        const validation = validatePlanEnhancerResponse(result);
        const validationReport = generateValidationReport(validation);
        console.log(validationReport);
        
        if (validation.errors.length > 0) {
          console.error(`[PlanEnhancer] ❌ ${validation.errors.length} validation errors found`);
        }
        if (validation.warnings.length > 0) {
          console.warn(`[PlanEnhancer] ⚠️  ${validation.warnings.length} validation warnings`);
        }
        
        console.log('[PlanEnhancer] ───────────────────────────────────────────────────');
        
        // Send validation progress update
        const validationStatus = validation.valid 
          ? "✅ All fields validated" 
          : validation.errors.length > 0
            ? `⚠️ ${validation.errors.length} validation errors`
            : `⚠️ ${validation.warnings.length} warnings`;
        sendProgress(77, validationStatus, "processing");
        
        // Flag truncation on the result so the client can show a warning
        if (finishReason === "length") {
          result._truncated = true;
          result._truncationWarning = "The AI response was truncated due to token limits. Some sections may be incomplete or missing. Try with shorter input documents or contact an administrator.";
        }
        
        // Add input truncation warning if documents were too large
        if (truncationWarning) {
          result._inputTruncated = true;
          result._inputTruncationWarning = truncationWarning;
          console.warn(`[PlanEnhancer] ⚠️  Input documents were truncated: ${truncationWarning}`);
        }
        // Quality validation and metrics
        console.log('[PlanEnhancer] ═══════════════════════════════════════════════════');
        console.log('[PlanEnhancer] QUALITY VALIDATION REPORT');
        console.log('[PlanEnhancer] ═══════════════════════════════════════════════════');
        
        const qualityMetrics = {
          wordCounts: {} as Record<string, number>,
          warnings: [] as string[],
          passes: [] as string[],
        };
        
        // Validate key narrative sections - INCREASED THRESHOLDS for comprehensive plans
        const narrativeSections = [
          { path: 'thisIsMe.whoAmI', minWords: 600, label: 'Who Am I (Life Story)' },
          { path: 'thisIsMe.hobbiesInterests', minWords: 300, label: 'Hobbies & Interests' },
          { path: 'thisIsMe.whatMakesGoodDay', minWords: 200, label: 'What Makes Good Day' },
          { path: 'myCarePlan.capacityAndSafeguarding', minWords: 400, label: 'Capacity & Safeguarding' },
          { path: 'myCarePlan.healthAndWellbeing', minWords: 800, label: 'Health & Wellbeing' },
          { path: 'myCarePlan.personalCareNeeds', minWords: 600, label: 'Personal Care Needs' },
          { path: 'myCarePlan.medicationRequirements', minWords: 500, label: 'Medication Requirements' },
          { path: 'myCarePlan.nutrition', minWords: 400, label: 'Nutrition' },
          { path: 'myCarePlan.mobilityAndEquipment', minWords: 400, label: 'Mobility & Equipment' },
        ];
        
        narrativeSections.forEach(({ path, minWords, label }) => {
          const parts = path.split('.');
          let value = result;
          for (const part of parts) {
            value = value?.[part];
          }
          
          if (typeof value === 'string' && value.trim()) {
            const wordCount = value.trim().split(/\s+/).length;
            const sentenceCount = value.split(/[.!?]+/).filter((s: string) => s.trim().length > 10).length;
            qualityMetrics.wordCounts[label] = wordCount;
            
            if (wordCount >= minWords) {
              qualityMetrics.passes.push(`✅ ${label}: ${wordCount} words (min ${minWords})`);
            } else {
              qualityMetrics.warnings.push(`⚠️  ${label}: Only ${wordCount} words (min ${minWords} required)`);
            }
            
            // Check for first-person language
            const hasFirstPerson = /\b(I|my|me)\b/i.test(value);
            if (!hasFirstPerson && wordCount > 20) {
              qualityMetrics.warnings.push(`⚠️  ${label}: May not be in first person`);
            }

            if (wordCount > 40 && sentenceCount < 2) {
              qualityMetrics.warnings.push(`⚠️  ${label}: Too few sentences for detailed narrative`);
            }
            
            // Check for vague language
            const vagueTerms = ['various', 'some', 'appropriate', 'as needed', 'support is provided'];
            const foundVague = vagueTerms.filter(term => value.toLowerCase().includes(term));
            if (foundVague.length > 0) {
              qualityMetrics.warnings.push(`⚠️  ${label}: Contains vague terms: ${foundVague.join(', ')}`);
            }
            
            // Check for forbidden placeholders
            const forbiddenPhrases = ['needs user input', 'to be confirmed', 'insert', '[', ']', 'the service user', 'the client'];
            const foundForbidden = forbiddenPhrases.filter(phrase => value.toLowerCase().includes(phrase.toLowerCase()));
            if (foundForbidden.length > 0) {
              qualityMetrics.warnings.push(`❌ ${label}: Contains forbidden phrases: ${foundForbidden.join(', ')}`);
            }
            
            // Special check for whoAmI - must start with "My name is"
            if (path === 'thisIsMe.whoAmI') {
              const startsCorrectly = /^my\s+name\s+is/i.test(value.trim());
              if (startsCorrectly) {
                qualityMetrics.passes.push(`✅ Life Story: Correctly starts with "My name is..."`);
              } else {
                qualityMetrics.warnings.push(`⚠️  Life Story: Should start with "My name is [Name]. I was born in..."`);
              }
            }
          } else {
            qualityMetrics.warnings.push(`❌ ${label}: Missing or empty`);
          }
        });
        
        // Log quality metrics
        if (qualityMetrics.passes.length > 0) {
          console.log('[PlanEnhancer] Quality Passes:');
          qualityMetrics.passes.forEach(pass => console.log(`[PlanEnhancer]   ${pass}`));
        }
        
        if (qualityMetrics.warnings.length > 0) {
          console.log('[PlanEnhancer] Quality Warnings:');
          qualityMetrics.warnings.forEach(warning => console.log(`[PlanEnhancer]   ${warning}`));
        }
        
        // Calculate overall quality score
        const totalSections = narrativeSections.length;
        const passedSections = qualityMetrics.passes.length;
        const qualityScore = Math.round((passedSections / totalSections) * 100);
        
        console.log('[PlanEnhancer] ───────────────────────────────────────────────────');
        console.log(`[PlanEnhancer] Overall Quality Score: ${qualityScore}/100`);
        console.log(`[PlanEnhancer] Sections Meeting Standards: ${passedSections}/${totalSections}`);
        console.log(`[PlanEnhancer] Total Words Generated: ${Object.values(qualityMetrics.wordCounts).reduce((a, b) => a + b, 0)}`);
        console.log('[PlanEnhancer] ═══════════════════════════════════════════════════');

        // Attach quality warnings to result so client can display them
        if (qualityMetrics.warnings.length > 0) {
          result._qualityWarnings = qualityMetrics.warnings;
        }
        result._qualityScore = qualityScore;
        
        // Attach schema validation results to payload
        if (validation.errors.length > 0) {
          result._validationErrors = validation.errors.map(e => `${e.section}.${e.field}: "${e.value}" is invalid (allowed: ${e.expected?.join(', ') || 'see schema'})`);
        }
        if (validation.warnings.length > 0) {
          result._validationWarnings = validation.warnings.map(w => `${w.section}.${w.field}: ${w.message}`);
        }
        result._validationScore = validation.valid ? 100 : Math.max(0, 100 - (validation.errors.length * 10 + validation.warnings.length * 2));

        // Check for critical missing top-level sections (sign of severe truncation)
        const criticalSections = ['thisIsMe', 'myCarePlan', 'goalSetting', 'riskSection1Health', 'riskSection2Medication'];
        const missingSections = criticalSections.filter(s => !result[s] || (typeof result[s] === 'object' && Object.keys(result[s]).length === 0));
        if (missingSections.length > 0) {
          console.error(`[PlanEnhancer] ❌ CRITICAL: Missing top-level sections: ${missingSections.join(', ')}`);
          result._missingSections = missingSections;
          if (!result._truncated) {
            result._truncated = true;
            result._truncationWarning = `The following sections are missing from the AI output: ${missingSections.join(', ')}. The AI may have been truncated or failed to generate a complete plan.`;
          }
        }
        
        // Template-Only AI: Convert tokens to readable placeholders (no PII in output)
        // Output is GDPR-exempt as it contains no personal data
        const templateResult = piiVault.toPlaceholders(result);
        console.log(`[Enhance] Template Output: ${piiVault.getStats().total} fields converted to placeholders like [Name], [NHS Number]`);
        piiVault.logAudit('SCRUB', '/api/ai/enhance-plan', aiUserContext.userId, aiUserContext.username);
        
        // Always export vault for automatic client-side name restoration
        const vaultExport = piiVault.export();
        const payload = {
          ...templateResult,
          vaultExport,
          rawWithTokens: result,
        };
        console.log(`[Enhance] Including vault export with ${vaultExport.mapping ? Object.keys(vaultExport.mapping).length : 0} tokens for automatic local restoration`);
        piiVault.logAudit('RESTORE', '/api/ai/enhance-plan', aiUserContext.userId, aiUserContext.username);
        
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', payload);
        
        // Clear vault after use (security best practice)
        piiVault.clear();
        
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        console.error(`[PlanEnhancer] Failed to parse AI response. finish_reason=${finishReason}, content_length=${contentLength}`);
        console.error(`[PlanEnhancer] Raw content (first 500 chars): ${content.substring(0, 500)}`);
        piiVault.clear(); // Clear vault on error too
        const parseErrorMsg = finishReason === "length"
          ? "AI response was truncated and could not be parsed. The input documents may be too large. Please try with fewer or shorter documents."
          : contentLength === 0
            ? "AI returned an empty response. The service may be temporarily unavailable. Please try again."
            : "Failed to parse AI response. Please try again or contact an administrator.";
        sendEvent('error', { message: parseErrorMsg });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error: any) {
      console.error("Plan Enhancement Error:", error);
      piiVault.clear(); // Clear vault on error too
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (progressInterval) clearInterval(progressInterval);

      // Classify the error to give users actionable info without leaking internals
      const msg = error?.message || "";
      const status = error?.status || error?.response?.status;
      let userMessage = "AI enhancement failed";

      if (error?.code === "GITHUB_QUOTA_EXCEEDED" || status === 429 || msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota")) {
        userMessage = "AI provider rate limit exceeded. Please wait 1-2 minutes and try again.";
      } else if (error?.code === "GITHUB_PERMISSION_DENIED" || (status === 401 && msg.toLowerCase().includes("permission"))) {
        userMessage = "AI provider permission denied. The API token may need additional scopes — contact an administrator.";
      } else if (error?.code === "GITHUB_AUTH_FAILED" || status === 401 || status === 403) {
        userMessage = "AI provider authentication failed. The API key may be invalid or expired — contact an administrator.";
      } else if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("ETIMEDOUT") || msg.includes("ECONNABORTED")) {
        userMessage = "AI request timed out. The documents may be too large — try with fewer or shorter documents.";
      } else if (msg.includes("AI disabled") || msg.includes("security policy")) {
        userMessage = "AI features are currently disabled by security policy. Contact an administrator.";
      } else if (msg.includes("PII detected")) {
        userMessage = "Content security check failed. Please try again or contact an administrator.";
      } else if (msg.includes("not configured") || msg.includes("API key")) {
        userMessage = "AI provider is not configured. Contact an administrator to set up the API key.";
      } else if (status >= 500 || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
        userMessage = "AI service is temporarily unavailable. Please try again in a few minutes.";
      } else if (msg.includes("did not contain content") || msg.includes("empty response")) {
        userMessage = "AI returned an empty response. The service may be overloaded — please try again.";
      }

      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: userMessage })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ message: userMessage });
    }
  });

  // ===== RISK ASSESSMENT LOG ROUTES =====

  // Create a risk assessment log
  app.post("/api/risk-assessment-logs", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const log = await storage.createRiskAssessmentLog(req.body);
      return res.status(201).json(log);
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create risk assessment log") });
    }
  });

  // Get all risk assessment logs (admin only)
  app.get("/api/risk-assessment-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAllRiskAssessmentLogs();
      return res.json(logs);
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load risk assessment logs") });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN PORTAL ROUTES  →  server/routes/adminPortal.ts
  // ═══════════════════════════════════════════════════════════════════════════
  registerAdminPortalRoutes(app, { requireAuth, requireAdmin, sendToUser, sessionStore });

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL ASSISTANT & PRN PROTOCOL ROUTES  →  server/routes/emailAssistant.ts
  // ═══════════════════════════════════════════════════════════════════════════
  registerEmailAssistantRoutes(app, { requireAuth });

  // =====================================================================
  // EMAR REFUSAL REVIEW ENDPOINTS
  // =====================================================================

  // Create a refusal review
  app.post("/api/refusal-reviews", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const { auditId, careWorkerName, medication, refusalDate, timeSlot, reasonAcceptable, reviewerNotes } = req.body;
      
      if (!careWorkerName || !medication || !refusalDate) {
        return res.status(400).json({ message: "Care worker name, medication, and refusal date are required" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const review = await storage.createRefusalReview({
        auditId: auditId || null,
        careWorkerName,
        medication,
        refusalDate,
        timeSlot: timeSlot || null,
        reasonAcceptable: reasonAcceptable || false,
        reviewerNotes: reviewerNotes || null,
        reviewedBy: user.username,
      });

      return res.status(201).json(review);
    } catch (error: any) {
      console.error("Refusal review creation error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create refusal review") });
    }
  });

  // Get all refusal reviews
  app.get("/api/refusal-reviews", requireAuth, async (req, res) => {
    try {
      const reviews = await storage.getAllRefusalReviews();
      return res.json(reviews);
    } catch (error: any) {
      console.error("Get refusal reviews error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get refusal reviews") });
    }
  });

  // Update a refusal review (only original reviewer or admin)
  app.patch("/api/refusal-reviews/:id", requireAuth, async (req, res) => {
    try {
      const { reasonAcceptable, reviewerNotes } = req.body;
      
      // Get the authenticated user to track who made the update
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Fetch existing review for ownership check
      const existing = await storage.getRefusalReview(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Refusal review not found" });
      }

      // Only the original reviewer or an admin can update
      if (existing.reviewedBy !== user.username && user.role !== "admin") {
        return res.status(403).json({ message: "Only the original reviewer or an admin can update this review" });
      }
      
      const review = await storage.updateRefusalReview(
        req.params.id,
        reasonAcceptable,
        user.username,  // Always use session user, never client-supplied
        reviewerNotes
      );

      if (!review) {
        return res.status(404).json({ message: "Refusal review not found" });
      }

      return res.json(review);
    } catch (error: any) {
      console.error("Refusal review update error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update refusal review") });
    }
  });

  // Bulk create refusal reviews
  app.post("/api/refusal-reviews/bulk", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const { reviews } = req.body;
      
      if (!Array.isArray(reviews) || reviews.length === 0) {
        return res.status(400).json({ message: "Reviews array is required" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const createdReviews = [];
      for (const r of reviews) {
        const review = await storage.createRefusalReview({
          auditId: r.auditId || null,
          careWorkerName: r.careWorkerName,
          medication: r.medication,
          refusalDate: r.refusalDate,
          timeSlot: r.timeSlot || null,
          reasonAcceptable: r.reasonAcceptable || false,
          reviewerNotes: r.reviewerNotes || null,
          reviewedBy: user.username,
        });
        createdReviews.push(review);
      }

      return res.status(201).json(createdReviews);
    } catch (error: any) {
      console.error("Bulk refusal review creation error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create refusal reviews") });
    }
  });

  // Save EMAR corrections (admin-only)
  app.post("/api/emar-corrections", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const { corrections, serviceUserInitials, auditId } = req.body;
      
      if (!Array.isArray(corrections) || corrections.length === 0) {
        return res.status(400).json({ message: "Corrections array is required" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      let count = 0;
      for (const c of corrections) {
        await storage.createEmarCorrection({
          adminId: user.id,
          adminUsername: user.username,
          auditId: auditId || null,
          serviceUserInitials: serviceUserInitials || null,
          originalMedication: c.originalMedication,
          originalDate: c.originalDate,
          originalTimeSlot: c.originalTimeSlot || null,
          originalCode: c.originalCode || null,
          originalCareWorker: c.originalCareWorker || null,
          correctedMedication: c.correctedMedication || null,
          correctedDate: c.correctedDate || null,
          correctedTimeSlot: c.correctedTimeSlot || null,
          correctedCode: c.correctedCode || null,
          correctedCareWorker: c.correctedCareWorker || null,
          correctionNote: c.correctionNote || null,
        });
        count++;
      }

      return res.status(201).json({ success: true, count });
    } catch (error: any) {
      console.error("EMAR corrections save error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to save EMAR corrections") });
    }
  });

  // NOTE: EMAR corrections are accessed internally via storage.getRecentEmarCorrections()
  // No public GET endpoint to protect sensitive correction data (admin-only access)

  // Get current AI provider preference (admin-only)
  app.get("/api/admin/ai-provider", requireAuth, requireAdmin, async (req, res) => {
    try {
      const aiEnabled = isAIEnabled();
      const readiness = await getAIProviderReadiness();
      return res.json({
        provider: readiness.provider,
        model: getLowCostModel(), // temporarily low cost mode override
        localLLMModel: getLocalLLMModel(),
        aiEnabled,
        requireLiveWebForLocal: getRequireLiveWebForLocal(),
        hasOpenAIKey: readiness.hasOpenAIKey,
        hasPATKey: readiness.hasPATKey,
        hasLocalLLM: readiness.hasLocalLLM,
        localLLMUrl: readiness.localLLMUrl,
        providerConfigured: readiness.providerConfigured,
        providerIssue: readiness.providerIssue,
      });
    } catch (error: any) {
      console.error("AI provider fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch AI provider") });
    }
  });

  // Set AI provider preference (admin-only)
  app.post("/api/admin/ai-provider", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { provider } = req.body;
      if (!isAIEnabled()) {
        return res.status(503).json({ message: getAIDisabledMessage() });
      }
      if (provider !== "openai" && provider !== "github" && provider !== "local") {
        return res.status(400).json({ message: "Invalid provider. Must be 'openai', 'github', or 'local'." });
      }
      
      // Check if the selected provider's key is configured
      // OpenAI can use its own key OR fall back to PAT_AI_KEY via GitHub endpoint
      if (provider === "openai" && !process.env.OPENAI_FALLBACK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.PAT_AI_KEY) {
        return res.status(400).json({ message: "No API key configured. Set OPENAI_API_KEY, OPENAI_FALLBACK_API_KEY, or PAT_AI_KEY." });
      }
      
      if (provider === "github" && !process.env.PAT_AI_KEY) {
        return res.status(400).json({ message: "GitHub AI key not configured. Set PAT_AI_KEY environment variable." });
      }
      
      if (provider === "local") {
        const isAvailable = await isLocalLLMAvailable();
        if (!isAvailable) {
          return res.status(400).json({ message: `Local LLM not available at ${getLocalLLMUrl()}. Ensure the local-llm service is running.` });
        }
      }
      
      setPreferredProvider(provider as AiProvider, true);
      
      console.log(`[Admin] AI provider changed to ${provider} by ${req.user?.username || 'unknown'}`);
      
      return res.json({ success: true, provider });
    } catch (error: any) {
      console.error("AI provider update error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update AI provider") });
    }
  });

  // Set Local LLM URL (admin-only)
  app.post("/api/admin/local-llm-url", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const rawUrl = String(req.body?.url || "").trim();
      if (!rawUrl) {
        return res.status(400).json({ message: "Local LLM URL is required." });
      }

      const normalizedUrl = rawUrl.startsWith("http") ? rawUrl : `http://${rawUrl}`;
      let parsed: URL;
      try {
        parsed = new URL(normalizedUrl);
      } catch {
        return res.status(400).json({ message: "Invalid URL format." });
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(400).json({ message: "URL must start with http:// or https://" });
      }

      setLocalLLMUrl(normalizedUrl, true);
      const hasLocalLLM = await isLocalLLMAvailable();

      console.log(`[Admin] Local LLM URL updated to ${normalizedUrl} by ${req.user?.username || 'unknown'}`);

      return res.json({
        success: true,
        localLLMUrl: getLocalLLMUrl(),
        hasLocalLLM,
      });
    } catch (error: any) {
      console.error("Local LLM URL update error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update Local LLM URL") });
    }
  });

  // Set local-provider web requirement policy (admin-only)
  app.post("/api/admin/local-web-policy", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { requireLiveWebForLocal } = req.body;
      if (typeof requireLiveWebForLocal !== "boolean") {
        return res.status(400).json({ message: "requireLiveWebForLocal must be a boolean value" });
      }

      setRequireLiveWebForLocal(requireLiveWebForLocal, true);
      console.log(`[Admin] Local live web requirement ${requireLiveWebForLocal ? "enabled" : "disabled"} by ${req.user?.username || "unknown"}`);

      return res.json({
        success: true,
        requireLiveWebForLocal: getRequireLiveWebForLocal(),
      });
    } catch (error: any) {
      console.error("Local web policy update error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update local web policy") });
    }
  });

  // Get EMAR agent preference (admin-only)
  app.get("/api/admin/emar-agent", requireAuth, requireAdmin, async (req, res) => {
    try {
      const useAgent = getUseEmarAgent();
      return res.json({ useEmarAgent: useAgent });
    } catch (error: any) {
      console.error("EMAR agent preference fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch EMAR agent preference") });
    }
  });

  // Set EMAR agent preference (admin-only)
  app.post("/api/admin/emar-agent", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { useEmarAgent } = req.body;
      if (typeof useEmarAgent !== "boolean") {
        return res.status(400).json({ message: "useEmarAgent must be a boolean value" });
      }
      if (useEmarAgent && !isAIEnabled()) {
        return res.status(503).json({ message: getAIDisabledMessage() });
      }
      
      setUseEmarAgent(useEmarAgent, true);
      
      console.log(`[Admin] EMAR agent ${useEmarAgent ? 'enabled' : 'disabled'} by ${req.user?.username || 'unknown'}`);
      
      return res.json({ success: true, useEmarAgent });
    } catch (error: any) {
      console.error("EMAR agent update error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update EMAR agent preference") });
    }
  });

  // =====================================================================
  // AI OPTIMIZATION SETTINGS (reduces API calls and costs)
  // =====================================================================

  // Get AI optimization settings (admin-only)
  app.get("/api/admin/ai-optimization", requireAuth, requireAdmin, async (req, res) => {
    try {
      const cacheStats = getCacheStats();
      return res.json({
        aiEnabled: isAIEnabled(),
        useCache: getUseAICache(),
        useRulesFirst: getUseRulesFirst(),
        liteMode: getAILiteMode(),
        cacheStats
      });
    } catch (error: any) {
      console.error("AI optimization fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch AI optimization settings") });
    }
  });

  // Set AI optimization settings (admin-only)
  app.post("/api/admin/ai-optimization", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { aiEnabled, useCache, useRulesFirst, liteMode, clearCacheNow } = req.body;

      if (typeof aiEnabled === "boolean") {
        try {
          setAIEnabled(aiEnabled, true);
        } catch (error: any) {
          return res.status(400).json({ message: safeErrorMessage(error, "Invalid AI enabled setting") });
        }
        if (!aiEnabled) {
          setUseEmarAgent(false, true);
        }
        console.log(`[Admin] AI ${aiEnabled ? "enabled" : "disabled"} by ${req.user?.username || 'unknown'}`);
      }
      
      if (typeof useCache === "boolean") {
        setUseAICache(useCache, true);
        console.log(`[Admin] AI Cache ${useCache ? 'enabled' : 'disabled'} by ${req.user?.username || 'unknown'}`);
      }
      
      if (typeof useRulesFirst === "boolean") {
        setUseRulesFirst(useRulesFirst, true);
        console.log(`[Admin] Rules-First ${useRulesFirst ? 'enabled' : 'disabled'} by ${req.user?.username || 'unknown'}`);
      }
      
      if (typeof liteMode === "boolean") {
        setAILiteMode(liteMode, true);
        console.log(`[Admin] Lite Mode ${liteMode ? 'enabled' : 'disabled'} by ${req.user?.username || 'unknown'}`);
      }
      
      if (clearCacheNow === true) {
        clearCache();
        console.log(`[Admin] AI Cache cleared by ${req.user?.username || 'unknown'}`);
      }
      
      const cacheStats = getCacheStats();
      return res.json({
        success: true,
        aiEnabled: isAIEnabled(),
        useCache: getUseAICache(),
        useRulesFirst: getUseRulesFirst(),
        liteMode: getAILiteMode(),
        cacheStats
      });
    } catch (error: any) {
      console.error("AI optimization update error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update AI optimization settings") });
    }
  });

  // Get AI cache statistics (admin-only)
  app.get("/api/admin/ai-cache-stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = getCacheStats();
      return res.json(stats);
    } catch (error: any) {
      console.error("AI cache stats fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch AI cache stats") });
    }
  });

  // =====================================================================
  // RULE-BASED QUICK ANALYSIS (No AI - Instant Response)
  // =====================================================================

  // Quick risk analysis using rule-based engine (no AI cost)
  app.post("/api/quick-analyze", requireAuth, async (req: any, res) => {
    try {
      const { content, analysisType } = req.body;
      
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Content string required" });
      }
      
      const type = analysisType || "auto";
      
      // Perform rule-based analysis
      const riskAnalysis = analyzeRiskLevel(content);
      const extractedFields = extractCommonFields(content);
      const qualityCheck = calculatePlanQuality(content);
      const aiDecision = shouldUseAI(
        type === "care_plan" ? "care_plan" : type === "risk" ? "risk_assessment" : "simple_extraction",
        content
      );
      
      console.log(`[QuickAnalyze] Rule-based analysis for ${req.user?.username}: ` +
        `Risk=${riskAnalysis.level} (${(riskAnalysis.confidence * 100).toFixed(0)}%), ` +
        `Fields=${Object.keys(extractedFields).length}, ` +
        `Quality=${qualityCheck.score}%, ` +
        `NeedsAI=${aiDecision.useAI}`);
      
      return res.json({
        rulesBased: true,
        aiNeeded: aiDecision.useAI,
        aiReason: aiDecision.reason,
        riskLevel: riskAnalysis.level,
        riskConfidence: riskAnalysis.confidence,
        riskKeywords: riskAnalysis.matchedKeywords,
        extractedFields,
        qualityScore: qualityCheck.score,
        qualityFeedback: qualityCheck.feedback,
        wordCount: content.trim().split(/\s+/).length
      });
    } catch (error: any) {
      console.error("Quick analyze error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Quick analysis failed") });
    }
  });

  // Comprehensive care plan extraction (rule-based, minimal AI)
  app.post("/api/extract-care-data", requireAuth, async (req: any, res) => {
    try {
      const { documentContent } = req.body;
      
      if (!documentContent || typeof documentContent !== "string") {
        return res.status(400).json({ message: "Document content required" });
      }
      
      // Import new extraction functions
      const { 
        extractCarePlanSections, 
        extractMedicationInfo, 
        extractPersonalCareNeeds,
        extractContinenceInfo,
        extractNutritionInfo,
        extractEnvironmentInfo,
        getRecommendedAssessments,
        generateBasicSummary
      } = await import("./services/ruleBasedEngine");
      
      // Run all rule-based extractions
      const sections = extractCarePlanSections(documentContent);
      const medications = extractMedicationInfo(documentContent);
      const personalCare = extractPersonalCareNeeds(documentContent);
      const continence = extractContinenceInfo(documentContent);
      const nutrition = extractNutritionInfo(documentContent);
      const environment = extractEnvironmentInfo(documentContent);
      
      // Get overall risk analysis
      const overallRisk = analyzeRiskLevel(documentContent);
      
      // Get recommended assessments based on extracted data
      const recommendations = getRecommendedAssessments({
        sections,
        medications,
        personalCare,
        continence,
        nutrition,
        environment
      });
      
      // Generate basic summaries for each section (lite mode)
      const summaries: Record<string, string> = {};
      for (const [section, data] of Object.entries({ personalCare, continence, nutrition })) {
        summaries[section] = generateBasicSummary(section, data);
      }
      
      // Determine if AI enhancement is recommended
      const extractionConfidence = Object.values(sections)
        .map(s => s.confidence)
        .reduce((sum, c) => sum + c, 0) / Math.max(Object.keys(sections).length, 1);
      
      const needsAI = extractionConfidence < 0.6 || overallRisk.requiresAI;
      
      console.log(`[ExtractCareData] Extracted ${Object.keys(sections).length} sections, ` +
        `${medications.length} meds, confidence=${(extractionConfidence * 100).toFixed(0)}%, ` +
        `${recommendations.length} recommended assessments`);
      
      return res.json({
        success: true,
        rulesBased: true,
        sections,
        medications,
        personalCare,
        continence,
        nutrition,
        environment,
        overallRiskLevel: overallRisk.level,
        overallRiskConfidence: overallRisk.confidence,
        riskKeywords: overallRisk.matchedKeywords,
        recommendedAssessments: recommendations,
        basicSummaries: summaries,
        extractionConfidence,
        suggestAIEnhancement: needsAI,
        aiEnhancementReason: needsAI 
          ? (extractionConfidence < 0.6 ? "Low extraction confidence" : "Complex risk factors detected")
          : null
      });
    } catch (error: any) {
      console.error("Care data extraction error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Extraction failed") });
    }
  });

  // Plan quality check (rule-based, no AI)
  app.post("/api/check-plan-quality", requireAuth, async (req: any, res) => {
    try {
      const { planContent } = req.body;
      
      if (!planContent || typeof planContent !== "string") {
        return res.status(400).json({ message: "Plan content required" });
      }
      
      const quality = calculatePlanQuality(planContent);
      const extractedFields = extractCommonFields(planContent);
      const riskAnalysis = analyzeRiskLevel(planContent);
      
      // Determine if AI enhancement would help
      const needsAI = quality.score < 70 || quality.feedback.length > 2;
      
      console.log(`[QualityCheck] Plan quality for ${req.user?.username}: ${quality.score}% (${quality.feedback.length} issues)`);
      
      return res.json({
        score: quality.score,
        grade: quality.score >= 80 ? "Good" : quality.score >= 60 ? "Fair" : "Needs Work",
        feedback: quality.feedback,
        suggestAIEnhancement: needsAI,
        detectedRisk: riskAnalysis.level,
        detectedFields: extractedFields
      });
    } catch (error: any) {
      console.error("Plan quality check error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Quality check failed") });
    }
  });

  // =====================================================================
  // EXTENSION API — Extracted to server/routes/extension.ts
  // =====================================================================
  registerExtensionRoutes(app, { requireAuth, requireAdmin });

  // =====================================================================
  // AI USAGE LOGS — Extracted to server/routes/aiUsage.ts
  // =====================================================================
  registerAiUsageRoutes(app, { requireAuth, requireAdmin });

  // =====================================================================
  // CALL RECONCILIATION - Excel Processing
  // =====================================================================
  
  // Helper to convert column letter to index (A=0, B=1, etc.)
  const colLetterToIndex = (letter: string): number => {
    let result = 0;
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 64);
    }
    return result - 1;
  };

  // Helper to convert index to column letter
  const indexToColLetter = (index: number): string => {
    let result = "";
    while (index >= 0) {
      result = String.fromCharCode((index % 26) + 65) + result;
      index = Math.floor(index / 26) - 1;
    }
    return result;
  };

  // Map cancellation reasons to variation codes
  function mapCancellationToCode(reason: string | null | undefined): string {
    if (!reason || typeof reason !== 'string') return "";
    const lowerReason = reason.toLowerCase().trim();
    
    if (lowerReason.includes("hospital")) return "L1";
    if (lowerReason.includes("capacity")) return "L5";
    if (lowerReason.includes("less than 24") || lowerReason.includes("<24") || lowerReason.includes("under 24")) return "L5";
    if (lowerReason.includes("more than 24") || lowerReason.includes(">24") || lowerReason.includes("over 24")) return "L4";
    if (lowerReason.includes("24 hour") && lowerReason.includes("less")) return "L5";
    if (lowerReason.includes("24 hour") && lowerReason.includes("more")) return "L4";
    
    return "";
  }

  // =====================
  // Support plan helpers
  // =====================

  // (moved to ./services/supportPlanCompare.ts)

  app.post("/api/billing-tool/analyze", requireAuth, requireAdmin, uploadImages.array("images"), async (req: any, res) => {
    try {
      const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
      if (files.length === 0) {
        return res.status(400).json({ message: "No photos uploaded" });
      }

      // SECURITY NOTE: Billing images are sent to vision AI for OCR extraction.
      // Image-based PII cannot be scrubbed with text-based methods.
      // This endpoint is restricted to admin users only (requireAdmin middleware).
      // All access is logged for GDPR audit trail.
      logSecurityEvent({
        eventType: 'AI_REQUEST',
        endpoint: '/api/billing-tool/analyze',
        userId: req.user?.id || null,
        username: req.user?.username || null,
        details: {
          action: 'billing_image_analysis',
          imageCount: files.length,
          note: 'Admin-only: service order images sent to vision AI for OCR extraction',
        },
      });

      const isCurrent = String(req.body?.isCurrent || "").toLowerCase() === "true";
      const endDateInput = typeof req.body?.endDate === "string" ? req.body.endDate : null;
      const asOfDateInput = typeof req.body?.asOfDate === "string" ? req.body.asOfDate : null;

      const analysisEndDate = isCurrent
        ? parseDateInput(asOfDateInput) || normalizeDate(new Date())
        : parseDateInput(endDateInput);

      if (!analysisEndDate) {
        return res.status(400).json({ message: "An end date is required for non-current service orders." });
      }

      const user = req.user ?? await storage.getUser(req.session.userId!);
      const aiUserContext: AiUserContext = {
        userId: user?.id != null ? String(user.id) : null,
        username: user?.username != null ? String(user.username) : null,
      };

      for (const file of files) {
        const scanCheck = await scanAndLogFile(file, "billing-tool-image", user?.username);
        if (!scanCheck.allowed) {
          return res.status(400).json({ message: scanCheck.error });
        }
      }

      const rawRows: any[] = [];
      const extractionWarnings: string[] = [];

      for (let i = 0; i < files.length; i += 1) {
        try {
          const rows = await extractRowsFromBillingImage(files[i], i, aiUserContext);
          if (Array.isArray(rows)) {
            rawRows.push(...rows);
          }
        } catch (error: any) {
          extractionWarnings.push(`Image ${i + 1}: ${error?.message || "Failed to extract rows"}`);
        }
      }

      if (rawRows.length === 0) {
        return res.status(400).json({
          message: extractionWarnings[0] || "No service requirement rows could be extracted from the photos.",
        });
      }

      const analysis = analyzeBillingRows(rawRows, {
        analysisEndDate,
        analysisAsOfDate: parseDateInput(asOfDateInput) || normalizeDate(new Date()),
        imageCount: files.length,
        extractionWarnings,
      });

      if (!analysis.summary.rowCount) {
        return res.status(400).json({ message: "No valid rows were detected in the uploaded photos." });
      }

      return res.json(analysis);
    } catch (error: any) {
      console.error("Billing tool error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to analyze service order images") });
    }
  });

  app.post("/api/support-plan/compare", requireAuth, requireAdmin, upload.single("supportPlan"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No support plan uploaded" });
      }

      const serviceOrdersRaw = req.body?.serviceOrders;
      if (!serviceOrdersRaw) {
        return res.status(400).json({ message: "Service order summary is required" });
      }

      let serviceOrders: ServiceOrderComparisonInput;
      try {
        serviceOrders = typeof serviceOrdersRaw === "string" ? JSON.parse(serviceOrdersRaw) : serviceOrdersRaw;
      } catch {
        return res.status(400).json({ message: "Invalid service order summary payload" });
      }

      const scanCheck = await scanAndLogFile(req.file, "support-plan", req.user?.username);
      if (!scanCheck.allowed) {
        return res.status(400).json({ message: scanCheck.error });
      }

      const name = req.file.originalname.toLowerCase();
      const mime = req.file.mimetype || "";

      let extractedText = "";
      const extractionWarnings: string[] = [];
      if (mime === "application/pdf" || name.endsWith(".pdf")) {
        const pdfResult = await extractPdfTextWithPdfjs(req.file.buffer);
        extractedText = pdfResult.text;
      } else {
        let pdfText = "";
        const convertedPdf = await tryConvertOfficeToPdf(req.file.buffer, req.file.originalname);
        if (convertedPdf) {
          const pdfResult = await extractPdfTextWithPdfjs(convertedPdf);
          pdfText = pdfResult.text;
          if (!pdfText.trim()) {
            extractionWarnings.push("Converted PDF text was empty; falling back to Word text extraction.");
          }
        } else {
          extractionWarnings.push("Word-to-PDF conversion unavailable; using direct Word text extraction.");
        }

        let wordText = "";
        try {
          const mammothResult = await mammoth.extractRawText({ buffer: req.file.buffer });
          wordText = mammothResult.value || "";
          if (!wordText.trim()) {
            extractionWarnings.push("Word text extraction returned no readable text.");
          }
        } catch (error: any) {
          extractionWarnings.push(error?.message || "Word text extraction failed.");
        }

        const pdfLength = pdfText.trim().length;
        const wordLength = wordText.trim().length;
        if (pdfLength && pdfLength >= wordLength) {
          extractedText = pdfText;
        } else if (wordLength) {
          extractedText = wordText;
        } else {
          extractedText = pdfText || wordText;
        }
      }

      if (!extractedText.trim()) {
        const isLegacyDoc = name.endsWith(".doc") && !name.endsWith(".docx");
        const message = isLegacyDoc
          ? "Could not read this .doc file. Please upload a .docx or PDF support plan."
          : "Could not read any text from the support plan";
        return res.status(400).json({ message });
      }

      const planData = extractSupportPlanDataFromText(extractedText);
      const comparison = compareSupportPlanToServiceOrders(planData, serviceOrders);

      return res.json({
        sourceFile: req.file.originalname,
        plan: planData,
        comparison,
        extractionWarnings,
      });
    } catch (error: any) {
      console.error("Support plan comparison error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to compare support plan") });
    }
  });

  app.post("/api/reconciliation/analyze", requireAuth, requireAdmin, uploadExcel.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log(`[Reconciliation] Processing file: ${req.file.originalname}`);

      // Detect file type and parse accordingly
      const fileName = req.file.originalname.toLowerCase();
      const isCSV = fileName.endsWith('.csv');
      
      let workbook;
      if (isCSV) {
        // Parse CSV file - convert buffer to string and parse
        const csvString = req.file.buffer.toString('utf-8');
        workbook = SafeXLSX.read(csvString, { type: "string", cellDates: true });
        console.log(`[Reconciliation] Parsed CSV file, converting to Excel format`);
      } else {
        // Read the Excel file with date parsing enabled
        workbook = SafeXLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to array of arrays for easier manipulation
      const data: any[][] = SafeXLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (data.length === 0) {
        return res.status(400).json({ message: "Excel file is empty" });
      }

      // Columns to DELETE (0-indexed):
      // A-E (0-4), G-I (6-8), K-T (10-19), U (20), V-W (21-22), Z-AD (25-29), AE (30), 
      // AH-AM (33-38), AP-BO (41-66), BR-DY (69-128), DZ (129), EA-FW (130-178)
      const columnsToDelete = new Set<number>();
      
      // A-E (0-4)
      for (let i = 0; i <= 4; i++) columnsToDelete.add(i);
      // G-I (6-8)
      for (let i = 6; i <= 8; i++) columnsToDelete.add(i);
      // K-T (10-19)
      for (let i = 10; i <= 19; i++) columnsToDelete.add(i);
      // U (20) - Service Requirement (removed after extracting value for Variation Reason)
      columnsToDelete.add(20);
      // V-W (21-22)
      for (let i = 21; i <= 22; i++) columnsToDelete.add(i);
      // Z-AD (25-29)
      for (let i = 25; i <= 29; i++) columnsToDelete.add(i);
      // AE (30)
      columnsToDelete.add(30);
      // AH-AM (33-38)
      for (let i = 33; i <= 38; i++) columnsToDelete.add(i);
      // AP-BO (41-66)
      for (let i = 41; i <= 66; i++) columnsToDelete.add(i);
      // BR-DY (69-128)
      for (let i = 69; i <= 128; i++) columnsToDelete.add(i);
      // DZ (129) - Cancellation Reason (removed after extracting value for Variation Reason)
      columnsToDelete.add(129);
      // EA-FW (130-178)
      for (let i = 130; i <= 178; i++) columnsToDelete.add(i);

      // Track original column positions for Service Requirement (U=20) and Cancellation Reason (DZ=129)
      const SERVICE_REQ_COL = 20; // U
      const CANCELLATION_COL = 129; // DZ

      // Process each row
      const processedData: any[][] = [];
      
      for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
        const row = data[rowIdx];
        const newRow: any[] = [];
        
        // Get original values before filtering
        const serviceReqValue = row[SERVICE_REQ_COL];
        const cancellationValue = row[CANCELLATION_COL];
        
        // Filter out deleted columns
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          if (!columnsToDelete.has(colIdx)) {
            newRow.push(row[colIdx]);
          }
        }
        
        // Add Variation Reason column
        if (rowIdx === 0) {
          // Header row
          newRow.push("Variation Reason");
        } else {
          // Data row - determine variation reason
          let variationReason = "";
          
          // Check if cancellation reason exists
          if (cancellationValue && String(cancellationValue).trim()) {
            variationReason = mapCancellationToCode(String(cancellationValue));
          }
          
          // If no service requirement, mark with A1
          if (!serviceReqValue || !String(serviceReqValue).trim()) {
            variationReason = "A1";
          }
          
          newRow.push(variationReason);
        }
        
        processedData.push(newRow);
      }

      // Create new workbook with processed data
      const newWorkbook = SafeXLSX.utils.book_new();
      const newWorksheet = SafeXLSX.utils.aoa_to_sheet(processedData, { cellDates: true });
      
      // Apply date format to cells that contain Date objects
      const range = SafeXLSX.utils.decode_range(newWorksheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = SafeXLSX.utils.encode_cell({ r: R, c: C });
          const cell = newWorksheet[cellAddress];
          if (cell && cell.t === 'd') {
            // Format as date with time: DD/MM/YYYY HH:MM:SS
            cell.z = 'DD/MM/YYYY HH:MM:SS';
          }
        }
      }
      
      SafeXLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Reconciled");

      // Generate Excel buffer
      const excelBuffer = SafeXLSX.write(newWorkbook, { type: "buffer", bookType: "xlsx" });

      // Set response headers for file download
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="reconciled_${Date.now()}.xlsx"`);
      
      console.log(`[Reconciliation] Processed ${processedData.length} rows, sending Excel file`);
      
      return res.send(excelBuffer);
    } catch (error: any) {
      console.error("Reconciliation error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to process Excel file") });
    }
  });

  // =====================================================================
  // CONTACT FORM  →  server/routes/contact.ts
  // =====================================================================
  registerContactRoutes(app, { requireAuth, requireAdmin });

  // =====================================================================
  // USER MESSAGING PORTAL  →  server/routes/messages.ts
  // =====================================================================
  registerMessageRoutes(app, { requireAuth });

  // =====================================================================
  // EXTRACTED DATA INGEST - Save analyzed data only (no raw workbooks)
  // =====================================================================

  const workbookIngestSchema = z.object({
    name: z.string().min(1).max(200),
    fileName: z.string().min(1).max(500),
    sourceHash: z.string().min(1).max(128),
    company: z.string().min(1).max(120).optional().nullable(),
    branch: z.string().min(1).max(120).optional().nullable(),
    totalRows: z.number().int().min(0).default(0),
    careWorkerCount: z.number().int().min(0).default(0),
    serviceUserCount: z.number().int().min(0).default(0),
    callGroupCount: z.number().int().min(0).default(0),
    rowAnalysis: z.array(z.any()).default([]),
  });

  const toWholeMinutes = (value: unknown) => {
    if (typeof value !== "number" || Number.isNaN(value)) return undefined;
    return Math.round(value);
  };

  app.post("/api/admin/rostering/workbook-uploads/ingest", express.json({ limit: '200mb' }), requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const payload = workbookIngestSchema.parse(req.body);

      try {
        await Promise.race([
          storage.getAppSetting("__ingest_preflight__"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Database preflight timed out")), 3000)),
        ]);
      } catch (dbError: any) {
        const dbMessage = String(dbError?.message || dbError || "");
        if (dbMessage.includes("arrayParser.create is not a function")) {
          return res.status(503).json({
            message:
              "Workbook ingest is temporarily unavailable due to a server database driver mismatch. Redeploy with fresh install cache or run npm install so pg-types parser compatibility is restored.",
          });
        }
        if (dbMessage.includes("self-signed certificate") || dbMessage.includes("SSL off")) {
          return res.status(503).json({
            message:
              "Workbook ingest is temporarily unavailable due to database SSL configuration. Set PGSSLMODE=require and (for Render internal Postgres) PGSSLREJECTUNAUTHORIZED=false, then redeploy.",
          });
        }
        return res.status(503).json({
          message: "Workbook ingest is temporarily unavailable because the database is not reachable.",
        });
      }

      const existing = await storage.getWorkbookUploadByHash(payload.sourceHash);
      if (existing) {
        return res.status(200).json({ upload: existing, deduped: true });
      }

      const expiry = getExpiryDate();

      const rawCalls: RawCallRecord[] = (payload.rowAnalysis || [])
        .filter((row: any) => row?.serviceUserName && row?.callTypeLabel && row?.plannedDateKey)
        .map((row: any) => ({
          serviceUserName: row.serviceUserName,
          workerName: row.actualWorker || row.plannedWorker || "Unknown",
          templateWorkerName: row.templateWorker ?? undefined,
          callTypeLabel: row.callTypeLabel || "Other",
          callDate: row.plannedDateKey,
          templateWeek: row.templateWeek === "week1" || row.templateWeek === "week2" ? row.templateWeek : undefined,
          templateDay: row.templateDay ?? undefined,
          serviceUserArea: row.serviceUserArea ?? undefined,
          serviceUserAddress: row.serviceUserAddress ?? undefined,
          serviceLocationBranch: row.serviceLocationBranch ?? undefined,
          serviceLocationType: row.serviceLocationType ?? undefined,
          scheduledStart: toWholeMinutes(row.plannedTimeMinutes),
          serviceRequirementEnd: toWholeMinutes(row.serviceRequirementEndTimeMinutes ?? row.plannedEndTimeMinutes),
          actualStart: toWholeMinutes(row.actualTimeMinutes),
          actualEnd: toWholeMinutes(row.actualEndTimeMinutes),
          plannedDuration: toWholeMinutes(row.plannedDurationMinutes),
          actualDuration: toWholeMinutes(row.actualDurationMinutes),
          isDoubleUp: row.isDoubleUpSlot ?? false,
          isTimeCritical: row.isTimeCritical ?? false,
          serviceRequirementStart: toWholeMinutes(row.serviceRequirementTimeMinutes ?? row.plannedTimeMinutes),
        }));

      const extracted = extractFromRawCalls(rawCalls);

      // Save analyzed service users
      await Promise.all(
        extracted.serviceUsers.map((su) =>
          storage.upsertAnalyzedServiceUser({
            serviceUserKey: su.serviceUserKey,
            serviceUserName: su.serviceUserName,
            serviceUserArea: su.serviceUserArea,
            serviceUserAddress: su.serviceUserAddress,
            serviceLocationBranch: su.serviceLocationBranch,
            serviceLocationType: su.serviceLocationType,
            totalCallsAnalyzed: su.totalCallsAnalyzed,
            earliestDataDate: su.earliestDataDate,
            latestDataDate: su.latestDataDate,
            expiresAt: expiry,
          })
        )
      );

      // Save analyzed care workers
      await Promise.all(
        extracted.careWorkers.map((cw) =>
          storage.upsertAnalyzedCareWorker({
            workerKey: cw.workerKey,
            workerName: cw.workerName,
            workerNameNormalized: cw.workerNameNormalized,
            isAdminStaff: cw.isAdminStaff,
            totalCallsAnalyzed: cw.totalCallsAnalyzed,
            uniqueServiceUsers: cw.uniqueServiceUsers,
            avgCallsPerDay: cw.avgCallsPerDay,
            avgMinutesPerDay: cw.avgMinutesPerDay,
            earliestDataDate: cw.earliestDataDate,
            latestDataDate: cw.latestDataDate,
            expiresAt: expiry,
          })
        )
      );

      // Save service orders
      await Promise.all(
        extracted.serviceOrders.map((order) =>
          storage.upsertServiceOrder({
            serviceUserKey: order.serviceUserKey,
            serviceUserName: order.serviceUserName,
            callTypeLabel: order.callTypeLabel,
            callTypeKey: order.callTypeKey,
            timeBand: order.timeBand,
            serviceRequirementMinutes: order.serviceRequirementMinutes,
            serviceRequirementStartTime: order.serviceRequirementStartTime,
            serviceRequirementEndTime: order.serviceRequirementEndTime,
            daysPerWeek: order.daysPerWeek,
            week1Days: order.week1Days,
            week2Days: order.week2Days,
            carersRequired: order.carersRequired,
            isTimeCritical: order.isTimeCritical,
            orderSummary: order.orderSummary,
            actualAvgStartTime: order.actualAvgStartTime,
            actualAvgDuration: order.actualAvgDuration,
            durationVariance: order.durationVariance,
            startTimeVariance: order.startTimeVariance,
            recommendedAdjustment: order.recommendedAdjustment,
            recommendedDurationMinutes: order.recommendedDurationMinutes,
            recommendedStartMinutes: order.recommendedStartMinutes,
            sourceDataCount: order.sourceDataCount,
            expiresAt: expiry,
          })
        )
      );

      // Save template assignments
      await Promise.all(
        extracted.templateAssignments.map((assignment) =>
          storage.upsertTemplateAssignment({
            workerKey: assignment.workerKey,
            workerName: assignment.workerName,
            serviceUserKey: assignment.serviceUserKey,
            serviceUserName: assignment.serviceUserName,
            callTypeLabel: assignment.callTypeLabel,
            timeBand: assignment.timeBand,
            templateWeek: assignment.templateWeek,
            templateDay: assignment.templateDay,
            isTemplated: assignment.isTemplated,
            isPrimary: assignment.isPrimary,
            serviceRequirementStartMinutes: assignment.serviceRequirementStartMinutes,
            sourceDateKey: assignment.sourceDateKey,
            sourceRowHash: assignment.sourceRowHash,
            expiresAt: expiry,
          })
        )
      );

      // Remove stale template assignments (slots with no template in latest data window)
      if (extracted.templateSlotStates?.length) {
        const staleSlots = extracted.templateSlotStates.filter((slot) => !slot.hasTemplate);
        const uniqueKeys = new Set(
          staleSlots.map(
            (slot) => `${slot.serviceUserKey}|${slot.callTypeLabel}|${slot.templateWeek}|${slot.templateDay}`
          )
        );
        await Promise.all(
          Array.from(uniqueKeys).map((key) => {
            const [serviceUserKey, callTypeLabel, templateWeek, templateDay] = key.split("|");
            return storage.deleteTemplateAssignmentsForSlot(serviceUserKey, callTypeLabel, templateWeek, templateDay);
          })
        );
      }

      // Save recommendations
      await Promise.all(
        extracted.recommendations.map((rec) =>
          storage.upsertCallRecommendation({
            serviceUserKey: rec.serviceUserKey,
            serviceUserName: rec.serviceUserName,
            callTypeLabel: rec.callTypeLabel,
            recommendationType: rec.recommendationType,
            currentValue: rec.currentValue,
            recommendedValue: rec.recommendedValue,
            reason: rec.reason,
            confidence: rec.confidence,
            priority: rec.priority,
            dataPoints: rec.dataPoints,
            expiresAt: expiry,
          })
        )
      );

      // Save analyzed calls (deduped)
      await storage.bulkInsertAnalyzedCalls(
        extracted.calls.map((call) => ({
          ...call,
          expiresAt: expiry,
        }))
      );

      const upload = await storage.createWorkbookUpload({
        fileName: payload.fileName,
        fileHash: payload.sourceHash,
        company: payload.company ?? null,
        branch: payload.branch ?? null,
        totalRows: extracted.stats.totalRows,
        dateRangeStart: extracted.stats.dateRangeStart,
        dateRangeEnd: extracted.stats.dateRangeEnd,
        careWorkersExtracted: extracted.stats.careWorkersExtracted,
        serviceUsersExtracted: extracted.stats.serviceUsersExtracted,
        callsExtracted: extracted.stats.callsExtracted,
        serviceOrdersGenerated: extracted.stats.serviceOrdersGenerated,
        templatesDetected: extracted.stats.templatesDetected,
        recommendationsCreated: extracted.stats.recommendationsCreated,
        uploadedBy: req.user?.id ?? null,
        uploadedByUsername: req.user?.username ?? null,
        processingStatus: "complete",
        completedAt: new Date(),
      });

      return res.status(201).json({ upload, deduped: false, stats: extracted.stats });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      const errorMessage = String(error?.message || error || "");
      if (errorMessage.includes("arrayParser.create is not a function")) {
        return res.status(503).json({
          message:
            "Workbook ingest is temporarily unavailable due to a server database driver mismatch. Redeploy with fresh install cache or run npm install so pg-types parser compatibility is restored.",
        });
      }
      if (errorMessage.includes("self-signed certificate") || errorMessage.includes("SSL off")) {
        return res.status(503).json({
          message:
            "Workbook ingest is temporarily unavailable due to database SSL configuration. Set PGSSLMODE=require and (for Render internal Postgres) PGSSLREJECTUNAUTHORIZED=false, then redeploy.",
        });
      }
      console.error("[Rostering] Failed to ingest workbook analysis:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to upload workbook") });
    }
  });

  const buildWorkbookUploadDetails = async (
    upload: WorkbookUpload,
    { includeWorkerRows = false }: { includeWorkerRows?: boolean } = {}
  ) => {
    const calls = await storage.getWorkbookAnalyzedCallsByDateRange(upload.dateRangeStart, upload.dateRangeEnd);

    if (calls.length === 0) {
      return {
        id: upload.id,
        name: upload.fileName,
        fileName: upload.fileName,
        totalRows: upload.totalRows,
        careWorkerCount: upload.careWorkersExtracted,
        serviceUserCount: upload.serviceUsersExtracted,
        callGroupCount: 0,
        rowAnalysis: [],
        callGroups: [],
        careWorkerRosters: [],
        doubleUpSlots: {},
        createdBy: upload.uploadedBy,
        createdByUsername: upload.uploadedByUsername,
        createdAt: upload.createdAt,
        updatedAt: upload.completedAt ?? upload.createdAt,
      };
    }

    const serviceUserKeys = Array.from(
      new Set(
        calls
          .map((call) => call.serviceUserKey)
          .filter((serviceUserKey): serviceUserKey is string => Boolean(serviceUserKey))
      )
    );

    const [serviceUsers, templateAssignments] = await Promise.all([
      storage.getAnalyzedServiceUsersByKeys(serviceUserKeys),
      storage.getTemplateAssignmentsByDateRange(upload.dateRangeStart, upload.dateRangeEnd, serviceUserKeys),
    ]);
    const serviceUserMap = new Map(serviceUsers.map((serviceUser: AnalyzedServiceUser) => [serviceUser.serviceUserKey, serviceUser]));
    const templateAssignmentMap = new Map<string, { workerKey: string; workerName: string; updatedAtMs: number }>();

    templateAssignments
      .filter((assignment) => assignment.isTemplated)
      .forEach((assignment) => {
        const key = `${assignment.serviceUserKey}|${assignment.callTypeLabel}|${assignment.templateWeek}|${assignment.templateDay}`;
        const existing = templateAssignmentMap.get(key);
        const updatedAtMs = (assignment.updatedAt ?? assignment.createdAt ?? new Date(0)).getTime();
        if (!existing || updatedAtMs > existing.updatedAtMs) {
          templateAssignmentMap.set(key, {
            workerKey: assignment.workerKey,
            workerName: assignment.workerName,
            updatedAtMs,
          });
        }
      });

    const rosterMap = new Map<string, any>();
    const doubleUpSlots: Record<string, string[]> = {};
    let rowCounter = 0;

    for (const call of calls) {
      const assignmentKey = `${call.serviceUserKey}|${call.callTypeLabel}|${call.templateWeek}|${call.templateDay}`;
      const templateAssignment = templateAssignmentMap.get(assignmentKey);
      const workerKey = templateAssignment?.workerKey ?? call.workerKey;
      const workerName = templateAssignment?.workerName ?? call.workerName;
      const serviceUserProfile = serviceUserMap.get(call.serviceUserKey);
      const serviceRequirementEndMinutes =
        typeof call.serviceRequirementEndMinutes === "number" ? call.serviceRequirementEndMinutes : null;
      const plannedEndMinutes =
        typeof call.plannedStartMinutes === "number" && typeof call.plannedDurationMinutes === "number"
          ? call.plannedStartMinutes + call.plannedDurationMinutes
          : serviceRequirementEndMinutes;
      const actualEndMinutes =
        typeof call.actualEndMinutes === "number"
          ? call.actualEndMinutes
          : typeof call.actualStartMinutes === "number" && typeof call.actualDurationMinutes === "number"
            ? call.actualStartMinutes + call.actualDurationMinutes
            : null;
      const roster = rosterMap.get(workerKey) || {
        key: workerKey,
        workerName,
        workerNameNormalized: workerName.toLowerCase().replace(/\s+/g, " "),
        ...(includeWorkerRows ? { rows: [], callRows: [] } : {}),
        shiftBars: [],
        shiftBarsCount: 0,
        isAdminStaff: false,
        usesTemplateAssignments: false,
        uniqueServiceUsers: new Set<string>(),
        uniqueDays: new Set<string>(),
        callGroups: [],
        callGroupMap: new Map<string, any>(),
      };

      const requirementStart =
        call.serviceRequirementStartMinutes ??
        call.plannedStartMinutes ??
        call.actualStartMinutes ??
        null;
      const durationMinutes =
        call.plannedDurationMinutes ??
        call.actualDurationMinutes ??
        null;
      if (call.serviceUserKey) roster.uniqueServiceUsers.add(call.serviceUserKey);
      if (call.callDate) roster.uniqueDays.add(call.callDate);

      const groupKey = `${call.serviceUserKey}_${call.callTypeKey}_${call.timeBand}`;
      let group = roster.callGroupMap.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          serviceUserName: call.serviceUserName,
          serviceUserArea: serviceUserProfile?.serviceUserArea ?? null,
          serviceUserAddress: serviceUserProfile?.serviceUserAddress ?? null,
          serviceUserLatitude: serviceUserProfile?.latitude ? parseFloat(serviceUserProfile.latitude) : null,
          serviceUserLongitude: serviceUserProfile?.longitude ? parseFloat(serviceUserProfile.longitude) : null,
          normalizedServiceUserKey: call.serviceUserKey,
          serviceUserKey: call.serviceUserKey,
          callTypeLabel: call.callTypeLabel,
          callTypeKey: call.callTypeKey,
          timeBandLabel: call.timeBand,
          requirementStartMinutes: requirementStart,
          requirementStartLabel: null,
          durationMinutes,
          totalCalls: 0,
          uniqueDays: 0,
          templatedWeekdayKeys: new Set<string>(),
          doubleUpWeekdayKeys: new Set<string>(),
          templatedRows: 0,
          isTimeCritical: Boolean(call.isTimeCritical),
          uniqueDayKeys: new Set<string>(),
          ...(includeWorkerRows ? { rows: [] } : {}),
        };
        roster.callGroups.push(group);
        roster.callGroupMap.set(groupKey, group);
      }

      if (call.callDate) group.uniqueDayKeys.add(call.callDate);
      group.totalCalls += 1;
      if (call.isTimeCritical) group.isTimeCritical = true;
      const templateKey = `${call.templateWeek}|${call.templateDay}`;
      const isTemplatedForSlot = Boolean(templateAssignment || call.isTemplated);
      if (isTemplatedForSlot) {
        group.templatedWeekdayKeys.add(templateKey);
        group.templatedRows += 1;
        roster.usesTemplateAssignments = true;
      }
      if (call.isDoubleUp) {
        group.doubleUpWeekdayKeys.add(templateKey);
        doubleUpSlots[groupKey] = [workerName];
      }

      if (includeWorkerRows) {
        const row = {
          rowNumber: ++rowCounter,
          status: "clean",
          data: {},
          emptyFields: [],
          numericWarnings: [],
          textWarnings: [],
          issues: [],
          scheduleDeltaMinutes: null,
          durationMatchPercent: null,
          scheduleFlag: false,
          durationFlag: false,
          durationOverrunFlag: false,
          workersMatch: null,
          plannedWorker: workerName,
          actualWorker: workerName,
          templateWorker: workerName,
          payrollRunDescription: null,
          serviceTypeDescription: null,
          isAdminStaffRow: false,
          isShiftBar: false,
          serviceDutyClassType: null,
          isExcludedServiceDutyClass: false,
          isAdhocCall: false,
          isTimeCritical: call.isTimeCritical,
          plannedTimeLabel: null,
          actualTimeLabel: null,
          plannedDurationMinutes: call.plannedDurationMinutes ?? null,
          actualDurationMinutes: call.actualDurationMinutes ?? null,
          plannedTimeMinutes: call.plannedStartMinutes ?? null,
          actualTimeMinutes: call.actualStartMinutes ?? null,
          serviceRequirementTimeMinutes: call.serviceRequirementStartMinutes ?? null,
          serviceRequirementTimeLabel: null,
          plannedDateLabel: call.callDate,
          plannedDateKey: call.callDate,
          serviceUserName: call.serviceUserName,
          serviceUserArea: serviceUserProfile?.serviceUserArea ?? null,
          serviceUserAddress: serviceUserProfile?.serviceUserAddress ?? null,
          serviceLocationBranch: serviceUserProfile?.serviceLocationBranch ?? call.serviceLocationBranch ?? null,
          serviceLocationType: serviceUserProfile?.serviceLocationType ?? call.serviceLocationType ?? null,
          templateWeek: call.templateWeek,
          templateDay: call.templateDay,
          normalizedServiceUserKey: call.serviceUserKey,
          isDuplicateSlotRow: false,
          excludeFromMetrics: false,
          callTypeLabel: call.callTypeLabel,
          serviceRequirementEndTimeMinutes: serviceRequirementEndMinutes,
          serviceRequirementEndTimeLabel: null,
          plannedEndTimeMinutes: plannedEndMinutes,
          actualEndTimeMinutes: actualEndMinutes,
        };

        roster.rows.push(row);
        roster.callRows.push(row);
        group.rows.push(row);
      }

      rosterMap.set(workerKey, roster);
    }

    const careWorkerRosters = Array.from(rosterMap.values()).map((roster) => {
      const callGroups = roster.callGroups.map((group: any) => {
        const serializedGroup = {
          ...group,
          uniqueDays: group.uniqueDayKeys.size,
          templatedWeekdayKeys: Array.from(group.templatedWeekdayKeys),
          doubleUpWeekdayKeys: Array.from(group.doubleUpWeekdayKeys),
        };
        delete serializedGroup.uniqueDayKeys;
        return serializedGroup;
      });
      const callRowsCount = callGroups.reduce(
        (sum: number, group: any) => sum + (group.totalCalls ?? 0),
        0
      );
      const missingRequirementTimes = callGroups.reduce(
        (sum: number, group: any) => sum + (group.requirementStartMinutes === null ? 1 : 0),
        0
      );
      return {
        key: roster.key,
        workerName: roster.workerName,
        workerNameNormalized: roster.workerNameNormalized,
        ...(includeWorkerRows ? { rows: roster.rows, callRows: roster.callRows } : {}),
        rowCount: includeWorkerRows ? roster.rows.length : callRowsCount,
        callRowsCount,
        shiftBars: roster.shiftBars,
        shiftBarsCount: roster.shiftBarsCount,
        isAdminStaff: roster.isAdminStaff,
        usesTemplateAssignments: roster.usesTemplateAssignments,
        uniqueServiceUsers: roster.uniqueServiceUsers.size,
        uniqueDays: roster.uniqueDays.size,
        missingRequirementTimes,
        callGroups,
      };
    });

    return {
      id: upload.id,
      name: upload.fileName,
      fileName: upload.fileName,
      totalRows: upload.totalRows,
      careWorkerCount: upload.careWorkersExtracted,
      serviceUserCount: upload.serviceUsersExtracted,
      callGroupCount: careWorkerRosters.reduce((sum: number, roster: any) => sum + (roster.callGroups?.length || 0), 0),
      rowAnalysis: [],
      callGroups: [],
      careWorkerRosters,
      doubleUpSlots,
      createdBy: upload.uploadedBy,
      createdByUsername: upload.uploadedByUsername,
      createdAt: upload.createdAt,
      updatedAt: upload.completedAt ?? upload.createdAt,
    };
  };

  // Legacy compatibility endpoints (no raw workbook storage)
  app.get("/api/admin/testing-features/workbooks", requireAuth, requireAdmin, async (req, res) => {
    try {
      const uploads = await storage.getAllWorkbookUploads();
      const summaries = uploads.map((upload) => ({
        id: upload.id,
        name: upload.fileName,
        fileName: upload.fileName,
        totalRows: upload.totalRows,
        careWorkerCount: upload.careWorkersExtracted,
        serviceUserCount: upload.serviceUsersExtracted,
        callGroupCount: 0,
        createdBy: upload.uploadedBy,
        createdByUsername: upload.uploadedByUsername,
        createdAt: upload.createdAt,
        updatedAt: upload.completedAt ?? upload.createdAt,
      }));
      return res.json(summaries);
    } catch (error: any) {
      console.error("[TestingFeatures] Failed to fetch uploads:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load workbooks") });
    }
  });

  app.get("/api/admin/testing-features/workbooks/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const upload = await storage.getWorkbookUpload(req.params.id);
      if (!upload) {
        return res.status(404).json({ message: "Workbook not found" });
      }

      return res.json(await buildWorkbookUploadDetails(upload, { includeWorkerRows: true }));
    } catch (error: any) {
      console.error("[TestingFeatures] Failed to fetch upload:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load workbook details") });
    }
  });

  app.delete("/api/admin/testing-features/workbooks/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const existing = await storage.getWorkbookUpload(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Workbook not found" });
      }

      await storage.deleteWorkbookUpload(req.params.id);
      console.log(`[TestingFeatures] Workbook deleted: ${existing.fileName}`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[TestingFeatures] Failed to delete upload:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete workbook") });
    }
  });

  // =====================================================================
  // EXTRACTED DATA - Service Users, Care Workers, Service Orders, Templates
  // =====================================================================

  // Service Orders
  app.get("/api/admin/rostering/service-orders", requireAuth, requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllServiceOrders();
      return res.json(orders);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch service orders:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load service orders") });
    }
  });

  app.get("/api/admin/rostering/service-orders/:serviceUserKey", requireAuth, requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getServiceOrdersByServiceUser(req.params.serviceUserKey);
      return res.json(orders);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch service orders:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load service orders") });
    }
  });

  app.delete("/api/admin/rostering/service-orders/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteServiceOrder(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete service order:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete service order") });
    }
  });

  // Template Assignments
  app.get("/api/admin/rostering/template-assignments", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { week, day, workerKey, serviceUserKey } = req.query;
      
      if (workerKey) {
        const assignments = await storage.getTemplateAssignmentsByWorker(workerKey as string);
        return res.json(assignments);
      }
      if (serviceUserKey) {
        const assignments = await storage.getTemplateAssignmentsByServiceUser(serviceUserKey as string);
        return res.json(assignments);
      }
      if (week && day) {
        const assignments = await storage.getTemplateAssignmentsForDay(week as string, day as string);
        return res.json(assignments);
      }
      
      const assignments = await storage.getAllTemplateAssignments();
      return res.json(assignments);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch template assignments:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load template assignments") });
    }
  });

  app.delete("/api/admin/rostering/template-assignments/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteTemplateAssignment(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete template assignment:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete template assignment") });
    }
  });

  // Analyzed Service Users
  app.get("/api/admin/rostering/service-users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const serviceUsers = await storage.getAllAnalyzedServiceUsers();
      return res.json(serviceUsers);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch service users:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load analyzed service users") });
    }
  });

  app.get("/api/admin/rostering/service-users/:key", requireAuth, requireAdmin, async (req, res) => {
    try {
      const serviceUser = await storage.getAnalyzedServiceUser(req.params.key);
      if (!serviceUser) {
        return res.status(404).json({ message: "Service user not found" });
      }
      return res.json(serviceUser);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch service user:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load service user") });
    }
  });

  app.delete("/api/admin/rostering/service-users/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteAnalyzedServiceUser(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete service user:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete service user") });
    }
  });

  // Analyzed Care Workers
  app.get("/api/admin/rostering/care-workers-analyzed", requireAuth, requireAdmin, async (req, res) => {
    try {
      const careWorkers = await storage.getAllAnalyzedCareWorkers();
      return res.json(careWorkers);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch care workers:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load analyzed care workers") });
    }
  });

  app.get("/api/admin/rostering/care-workers-analyzed/:key", requireAuth, requireAdmin, async (req, res) => {
    try {
      const careWorker = await storage.getAnalyzedCareWorker(req.params.key);
      if (!careWorker) {
        return res.status(404).json({ message: "Care worker not found" });
      }
      return res.json(careWorker);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch care worker:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load care worker") });
    }
  });

  app.delete("/api/admin/rostering/care-workers-analyzed/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteAnalyzedCareWorker(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete care worker:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete care worker") });
    }
  });

  // Call Recommendations
  app.get("/api/admin/rostering/recommendations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { serviceUserKey, pendingOnly } = req.query;
      
      if (pendingOnly === 'true') {
        const recommendations = await storage.getPendingCallRecommendations();
        return res.json(recommendations);
      }
      if (serviceUserKey) {
        const recommendations = await storage.getCallRecommendationsByServiceUser(serviceUserKey as string);
        return res.json(recommendations);
      }
      
      // For now return pending recommendations by default
      const recommendations = await storage.getPendingCallRecommendations();
      return res.json(recommendations);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch recommendations:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load recommendations") });
    }
  });

  app.post("/api/admin/rostering/recommendations/:id/apply", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const recommendation = await storage.applyCallRecommendation(req.params.id, req.user?.id ?? '');
      if (!recommendation) {
        return res.status(404).json({ message: "Recommendation not found" });
      }
      console.log(`[Rostering] Recommendation applied: ${recommendation.id}`);
      return res.json(recommendation);
    } catch (error: any) {
      console.error("[Rostering] Failed to apply recommendation:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to apply recommendation") });
    }
  });

  app.delete("/api/admin/rostering/recommendations/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteCallRecommendation(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete recommendation:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete recommendation") });
    }
  });

  // Workbook Uploads (metadata only - no raw data)
  app.get("/api/admin/rostering/workbook-uploads", requireAuth, requireAdmin, async (req, res) => {
    try {
      const uploads = await storage.getAllWorkbookUploads();
      return res.json(uploads);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch workbook uploads:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load workbook uploads") });
    }
  });

  app.get("/api/admin/rostering/workbook-uploads/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const upload = await storage.getWorkbookUpload(req.params.id);
      if (!upload) {
        return res.status(404).json({ message: "Workbook not found" });
      }

      return res.json(await buildWorkbookUploadDetails(upload));
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch workbook upload:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load workbook upload details") });
    }
  });

  app.delete("/api/admin/rostering/workbook-uploads/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteWorkbookUpload(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete workbook upload:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete workbook upload") });
    }
  });

  // Admin Database Management - Cleanup expired data
  app.post("/api/admin/rostering/cleanup-expired", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const result = await storage.cleanupAllExpiredData();
      console.log(`[Rostering] Cleanup completed:`, result);
      return res.json({
        success: true,
        deleted: result,
        message: `Cleaned up ${Object.values(result).reduce((a, b) => a + b, 0)} expired records`,
      });
    } catch (error: any) {
      console.error("[Rostering] Failed to cleanup expired data:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to cleanup expired data") });
    }
  });

  // Admin Database Management - Reset all rostering data (fresh start)
  app.post("/api/admin/rostering/reset-data", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const deleted = await storage.resetRosteringData();
      console.log("[Rostering] Reset completed:", deleted);
      return res.json({
        success: true,
        deleted,
        message: "All rostering data has been removed.",
      });
    } catch (error: any) {
      console.error("[Rostering] Failed to reset data:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to cleanup data") });
    }
  });

  // Admin Database Management - Get data stats
  app.get("/api/admin/rostering/data-stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      return res.json(await storage.getRosteringDataStats());
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch data stats:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load data statistics") });
    }
  });

  // =====================================================================
  // ROSTERING STUDIO - Recommended Times, Templates & Constraints
  // =====================================================================

  // Zod schemas for rostering endpoint validation
  const callTimeSchema = z.object({
    serviceUserKey: z.string().min(1),
    serviceUserName: z.string().min(1),
    callTypeLabel: z.string().min(1),
    recommendedStartMinutes: z.number().int().min(0).max(1440),
    toleranceMinutes: z.number().int().min(0).max(480).optional(),
    priority: z.number().int().min(1).max(10).optional(),
    notes: z.string().max(1000).nullable().optional(),
    id: z.string().optional(),
  });

  const workerStartTimeSchema = z.object({
    workerKey: z.string().min(1),
    workerName: z.string().min(1),
    templateWeek: z.enum(["week1", "week2"]),
    templateDay: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
    recommendedStartMinutes: z.number().int().min(0).max(1440),
    recommendedEndMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    maxCallsPerDay: z.number().int().min(0).max(100).nullable().optional(),
    maxMinutesPerDay: z.number().int().min(0).max(1440).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    id: z.string().optional(),
  });

  const workerTemplateSchema = z.object({
    workerKey: z.string().min(1),
    workerName: z.string().min(1),
    serviceUserKey: z.string().min(1),
    serviceUserName: z.string().min(1),
    callTypeLabels: z.array(z.string()).nullable().optional(),
    isPrimary: z.boolean().optional(),
    priority: z.number().int().min(1).max(10).optional(),
    templateWeek: z.string().nullable().optional(),
    templateDay: z.string().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    id: z.string().optional(),
  });

  const workerConstraintSchema = z.object({
    workerKey: z.string().min(1),
    workerName: z.string().min(1),
    maxCallsPerDay: z.number().int().min(0).max(100).nullable().optional(),
    maxMinutesPerDay: z.number().int().min(0).max(1440).nullable().optional(),
    maxCallsPerWeek: z.number().int().min(0).max(700).nullable().optional(),
    maxMinutesPerWeek: z.number().int().min(0).max(10080).nullable().optional(),
    preferredMaxDistance: z.number().int().min(0).nullable().optional(),
    availableDays: z.array(z.string()).nullable().optional(),
    unavailableDates: z.array(z.string()).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    id: z.string().optional(),
  });

  // --- Recommended Call Times ---
  app.get("/api/admin/rostering/workbooks/:id/call-times", requireAuth, requireAdmin, async (req, res) => {
    try {
      const callTimes = await storage.getRosteringRecommendedCallTimes(req.params.id);
      return res.json(callTimes);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch call times:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load call times") });
    }
  });

  app.post("/api/admin/rostering/workbooks/:id/call-times", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const parsed = callTimeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid call time data", errors: parsed.error.flatten().fieldErrors });
      }
      const callTime = await storage.upsertRosteringRecommendedCallTime({
        ...parsed.data,
        workbookId: req.params.id,
        createdBy: (req as any).user?.id ?? null,
        createdByUsername: (req as any).user?.username ?? null,
      });
      console.log(`[Rostering] Call time saved for ${parsed.data.serviceUserName} - ${parsed.data.callTypeLabel}`);
      return res.status(201).json(callTime);
    } catch (error: any) {
      console.error("[Rostering] Failed to save call time:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to save call time") });
    }
  });

  app.delete("/api/admin/rostering/call-times/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteRosteringRecommendedCallTime(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete call time:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete call time") });
    }
  });

  // --- Worker Start Times ---
  app.get("/api/admin/rostering/workbooks/:id/worker-start-times", requireAuth, requireAdmin, async (req, res) => {
    try {
      const startTimes = await storage.getRosteringWorkerStartTimes(req.params.id);
      return res.json(startTimes);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch worker start times:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load worker start times") });
    }
  });

  app.post("/api/admin/rostering/workbooks/:id/worker-start-times", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const parsed = workerStartTimeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid worker start time data", errors: parsed.error.flatten().fieldErrors });
      }
      const startTime = await storage.upsertRosteringWorkerStartTime({
        ...parsed.data,
        workbookId: req.params.id,
        createdBy: (req as any).user?.id ?? null,
        createdByUsername: (req as any).user?.username ?? null,
      });
      console.log(`[Rostering] Worker start time saved for ${parsed.data.workerName} - ${parsed.data.templateDay}`);
      return res.status(201).json(startTime);
    } catch (error: any) {
      console.error("[Rostering] Failed to save worker start time:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to save start time") });
    }
  });

  app.delete("/api/admin/rostering/worker-start-times/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteRosteringWorkerStartTime(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete worker start time:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete start time") });
    }
  });

  // --- Worker Templates (who visits whom) ---
  app.get("/api/admin/rostering/workbooks/:id/worker-templates", requireAuth, requireAdmin, async (req, res) => {
    try {
      const templates = await storage.getRosteringWorkerTemplates(req.params.id);
      return res.json(templates);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch worker templates:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load worker templates") });
    }
  });

  app.post("/api/admin/rostering/workbooks/:id/worker-templates", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const parsed = workerTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid worker template data", errors: parsed.error.flatten().fieldErrors });
      }
      const template = await storage.upsertRosteringWorkerTemplate({
        ...parsed.data,
        workbookId: req.params.id,
        createdBy: (req as any).user?.id ?? null,
        createdByUsername: (req as any).user?.username ?? null,
      });
      console.log(`[Rostering] Worker template saved: ${parsed.data.workerName} -> ${parsed.data.serviceUserName}`);
      return res.status(201).json(template);
    } catch (error: any) {
      console.error("[Rostering] Failed to save worker template:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to save worker template") });
    }
  });

  app.delete("/api/admin/rostering/worker-templates/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteRosteringWorkerTemplate(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete worker template:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete worker template") });
    }
  });

  // --- Worker Constraints (max calls per day) ---
  app.get("/api/admin/rostering/workbooks/:id/worker-constraints", requireAuth, requireAdmin, async (req, res) => {
    try {
      const constraints = await storage.getRosteringWorkerConstraints(req.params.id);
      return res.json(constraints);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch worker constraints:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load worker constraints") });
    }
  });

  app.post("/api/admin/rostering/workbooks/:id/worker-constraints", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const parsed = workerConstraintSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid worker constraint data", errors: parsed.error.flatten().fieldErrors });
      }
      const constraint = await storage.upsertRosteringWorkerConstraint({
        ...parsed.data,
        workbookId: req.params.id,
        createdBy: (req as any).user?.id ?? null,
        createdByUsername: (req as any).user?.username ?? null,
      });
      console.log(`[Rostering] Worker constraint saved for ${parsed.data.workerName}`);
      return res.status(201).json(constraint);
    } catch (error: any) {
      console.error("[Rostering] Failed to save worker constraint:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to save worker constraint") });
    }
  });

  app.delete("/api/admin/rostering/worker-constraints/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteRosteringWorkerConstraint(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete worker constraint:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete worker constraint") });
    }
  });

  // === Schedule Template Library ===

  app.get("/api/admin/rostering/workbooks/:id/template-library", requireAuth, requireAdmin, async (req, res) => {
    try {
      const templates = await storage.getScheduleTemplates(req.params.id);
      return res.json(templates);
    } catch (error: any) {
      console.error("[Rostering] Failed to fetch schedule templates:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load schedule templates") });
    }
  });

  app.post("/api/admin/rostering/workbooks/:id/template-library", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const { name, description, category, weekDay, weekNumber, scheduleState, metadata } = req.body;
      const template = await storage.createScheduleTemplate({
        workbookId: req.params.id,
        name: name || `Template ${new Date().toLocaleDateString()}`,
        description,
        category: category || "custom",
        weekDay,
        weekNumber,
        scheduleState: scheduleState || {},
        metadata: metadata || {},
        usageCount: 0,
        createdBy: req.user?.id ?? null,
        createdByUsername: req.user?.username ?? null,
      });
      console.log(`[Rostering] Created schedule template: ${template.name}`);
      return res.status(201).json(template);
    } catch (error: any) {
      console.error("[Rostering] Failed to create schedule template:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create schedule template") });
    }
  });

  app.delete("/api/admin/rostering/workbooks/:id/template-library/:templateId", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteScheduleTemplate(req.params.templateId);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete schedule template:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete schedule template") });
    }
  });

  // === Rostering Saved States ===

  // Get all saved states for a workbook
  app.get("/api/admin/rostering/workbooks/:id/saved-states", requireAuth, requireAdmin, async (req, res) => {
    try {
      const states = await storage.getRosteringSavedStates(req.params.id);
      return res.json(states);
    } catch (error: any) {
      console.error("[Rostering] Failed to get saved states:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load saved states") });
    }
  });

  // Create a new saved state
  app.post("/api/admin/rostering/workbooks/:id/saved-states", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const { name, description, templateWeek, templateDay, timeOverrides, laneOverrides, metrics, isActive } = req.body;

      const state = await storage.createRosteringSavedState({
        workbookId: req.params.id,
        name: name || `Schedule ${new Date().toLocaleDateString()}`,
        description,
        templateWeek,
        templateDay,
        timeOverrides: timeOverrides || {},
        laneOverrides: laneOverrides || {},
        metrics,
        isActive: isActive ?? false,
        createdBy: req.user?.id ?? null,
        createdByUsername: req.user?.username ?? null,
      });

      console.log(`[Rostering] Created saved state: ${state.name}`);
      return res.status(201).json(state);
    } catch (error: any) {
      console.error("[Rostering] Failed to create saved state:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create saved state") });
    }
  });

  // Update a saved state
  app.put("/api/admin/rostering/saved-states/:id", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const { name, description, timeOverrides, laneOverrides, metrics } = req.body;

      const updated = await storage.updateRosteringSavedState(req.params.id, {
        name,
        description,
        timeOverrides,
        laneOverrides,
        metrics,
      });

      if (!updated) {
        return res.status(404).json({ message: "Saved state not found" });
      }

      console.log(`[Rostering] Updated saved state: ${updated.name}`);
      return res.json(updated);
    } catch (error: any) {
      console.error("[Rostering] Failed to update saved state:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update saved state") });
    }
  });

  // Set a saved state as active
  app.post("/api/admin/rostering/saved-states/:id/activate", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const state = await storage.getRosteringSavedState(req.params.id);
      if (!state) {
        return res.status(404).json({ message: "Saved state not found" });
      }

      const activated = await storage.setActiveRosteringSavedState(req.params.id, state.workbookId);
      console.log(`[Rostering] Activated saved state: ${activated?.name}`);
      return res.json(activated);
    } catch (error: any) {
      console.error("[Rostering] Failed to activate saved state:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to activate saved state") });
    }
  });

  // Delete a saved state
  app.delete("/api/admin/rostering/saved-states/:id", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      await storage.deleteRosteringSavedState(req.params.id);
      console.log(`[Rostering] Deleted saved state: ${req.params.id}`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Rostering] Failed to delete saved state:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete saved state") });
    }
  });

  // Get active saved state for a specific template week/day
  app.get("/api/admin/rostering/workbooks/:id/active-state", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { templateWeek, templateDay } = req.query;
      if (!templateWeek || !templateDay) {
        return res.status(400).json({ message: "templateWeek and templateDay are required" });
      }

      const state = await storage.getActiveRosteringSavedState(
        req.params.id,
        templateWeek as string,
        templateDay as string
      );
      return res.json(state || null);
    } catch (error: any) {
      console.error("[Rostering] Failed to get active state:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load active state") });
    }
  });

  // AI-powered schedule analysis
  app.post("/api/admin/rostering/workbooks/:id/analyze-schedule", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!isAIEnabled()) {
        return res.status(503).json({ message: getAIDisabledMessage() });
      }
      const { analyzeScheduleWithAI } = await import("./services/scheduleAnalyzer");
      const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
      const analysis = await analyzeScheduleWithAI(req.body, aiUserContext);
      console.log(`[Rostering] Schedule analysis completed for workbook: ${req.params.id}`);
      return res.json(analysis);
    } catch (error: any) {
      console.error("[Rostering] Schedule analysis failed:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to analyze schedule") });
    }
  });

  // AI-powered schedule comparison
  app.post("/api/admin/rostering/workbooks/:id/compare-schedules", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!isAIEnabled()) {
        return res.status(503).json({ message: getAIDisabledMessage() });
      }
      const { compareSchedulesWithAI } = await import("./services/scheduleAnalyzer");
      const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
      const comparison = await compareSchedulesWithAI(req.body, aiUserContext);
      console.log(`[Rostering] Schedule comparison completed for workbook: ${req.params.id}`);
      return res.json(comparison);
    } catch (error: any) {
      console.error("[Rostering] Schedule comparison failed:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to compare schedules") });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // AI CHAT ASSISTANT - Helps users navigate the platform
  // ═══════════════════════════════════════════════════════════════════════════════

  const CHAT_ASSISTANT_SYSTEM_PROMPT = `You are Compli-ee, the friendly compliance assistant mascot for CareAssurance - an enterprise care management platform used by domiciliary care companies to manage compliance, medication auditing, staff performance, and care planning.

## YOUR CHARACTER
You're Compli-ee - a cheerful, helpful little clipboard character who loves making compliance easy and approachable! You're enthusiastic about helping people but keep things professional since corporate users rely on you. You can have brief moments of workplace-appropriate humour, but your main goal is being genuinely helpful.

Personality traits:
- Friendly and approachable
- Knowledgeable about the platform
- Patient with questions
- Occasionally cheeky (but professionally so)
- Always encouraging

## PLATFORM OVERVIEW
CareAssurance helps care companies with:

### Dashboard
The main hub showing key metrics, alerts, and quick access to all features.

### Email Assistant
Write professional emails for common care scenarios - family updates, GP communications, safeguarding concerns, and more. The AI drafts emails that you can review and edit.

### Compliance
Upload and manage policy documents. The system extracts key compliance dates and tracks when reviews are due.

### Service Users Module
- **Data Upload**: Import service user data from CSV/Excel files exported from your care management system
- **Care Planning**: View and manage care plans, compare against service orders
- **Risk Assessment**: AI-assisted risk assessments using uploaded documentation
- **Plan Enhancer**: Use AI to improve and enrich existing care plans with more detail

### Care Workers Module
- **Carers List**: View all care workers and their details
- **EMAR Audit**: Upload EMAR (Electronic Medication Administration Records) PDFs for AI-powered discrepancy detection
- **Visit Audit**: Review visit data and identify potential issues
- **Performance**: Track care worker performance metrics

### Drug Interaction Checker
Available in EMAR audit workflows. Checks medications for dangerous interactions using both rule-based and AI analyses. Covers anticoagulant+NSAID, opioid+sedative, QT-prolonging combinations, and more.

### Settings
Configure your account preferences, notification settings, and manage your profile.

## UK CARE REGULATION KNOWLEDGE
You should be aware of these frameworks when answering compliance questions:
- **CQC KLOEs**: Safe, Effective, Caring, Responsive, Well-led
- **Key Regulations**: Regulation 9 (Person-centred care), Regulation 12 (Safe care), Regulation 13 (Safeguarding), Regulation 17 (Good governance), Regulation 18 (Staffing), Regulation 19 (Fit and proper persons), Regulation 20 (Duty of candour), Regulation 20A (Requirements as to display of performance assessments)
- **MCA/DoLS**: Mental Capacity Act 2005, Deprivation of Liberty Safeguards
- **GDPR/DPA 2018**: Data protection for service user information
- **NICE Guidelines**: Reference when discussing evidence-based practice
- **BNF**: Reference for medication-related queries
You don't need to cite these unprompted, but use this knowledge to give accurate compliance guidance.

## RESPONSE GUIDELINES
1. Be warm and professional - suitable for corporate use
2. Keep explanations clear and practical
3. Use bullet points for step-by-step guidance
4. You can have brief, appropriate humour but don't overdo it
5. Always be helpful and encouraging
6. Sign off naturally - don't be robotic

## STRICT RESTRICTIONS - EXTREMELY IMPORTANT
You have ABSOLUTE restrictions that you MUST follow:

### ADMIN AREAS (FORBIDDEN FOR NON-ADMIN USERS)
If the user is NOT an admin, you MUST NOT:
- Discuss, mention, or guide users to the Administrator Controls
- Discuss the ROI Calculator / Features & Benefits page
- Discuss Testing Features or experimental tools
- Discuss System Logs or audit trails
- Discuss Rostering Studio or shift scheduling
- Discuss the Billing Tool
- If asked about any admin features, politely explain these are administrator-only areas

### BACKEND/TECHNICAL DETAILS (FORBIDDEN FOR ALL USERS)
You MUST NOT discuss:
- How the AI models work behind the scenes
- API endpoints or database structures
- Implementation details, code, or architecture
- Server configurations or infrastructure
- How the EMAR parsing works technically
- Internal algorithms or processing methods

If a user asks about technical/backend details, respond playfully:
"Ah, wouldn't that spoil all the fun! There's some clever magic happening behind the scenes, but the real question is - what can I help you actually do with the platform? That's where the good stuff is!"

### TONE & LANGUAGE
- NO swearing or inappropriate language under any circumstances
- Keep things professional - this is enterprise software
- Brief humour is okay but don't force it
- Never be condescending

## EXAMPLES OF GOOD RESPONSES

User: "How do I upload EMAR sheets?"
Compli-ee: "Great question! For EMAR auditing, head to Care Workers → EMAR Audit. You can upload PDF files of your EMAR records there, and the system will analyse them for any discrepancies - things like missed signatures, timing issues, or medication gaps. It's quite thorough! Would you like me to explain what to look for in the results?"

User: "How does the AI work?"
Compli-ee: "Ah, wouldn't that spoil all the fun! Let's just say there's some clever technology working hard behind the curtain. But honestly, what matters most is how it helps you day-to-day. Is there a specific feature you'd like to get more out of?"

User: "Can I see system logs?"
Good (for non-admin): "System Logs are an administrator feature - you'd need to speak with your admin if you need access to those. Is there something specific you were trying to find out? I might be able to help another way."
Good (for admin): "Absolutely! You can find System Logs under the Admin menu. It shows audit trails and system activity. What were you hoping to find there?"

## SPECIAL ABILITIES
You can send messages to users' message inbox when asked. If a user asks you to "send me a message", "remind me later", "message me about this", or similar, you can use your send_message function to deliver a message to their inbox. The message will appear in their Messages section.

Example phrases that should trigger message sending:
- "Send me a message about X"
- "Can you message me this?"
- "Remind me about this in my inbox"
- "Send this to my messages"
- "Put this in my inbox"`;

  // Function definition for sending messages
  const SEND_MESSAGE_FUNCTION = {
    name: "send_message",
    description: "Send a message to the user's messaging inbox. Use this when the user asks you to send them a message, reminder, or asks you to put something in their inbox.",
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Brief subject line for the message (max 100 characters)",
        },
        message: {
          type: "string",
          description: "The full message content to send to the user",
        },
        priority: {
          type: "string",
          enum: ["normal", "high", "urgent"],
          description: "Message priority level. Use 'normal' for most messages, 'high' for important reminders, 'urgent' only for critical matters.",
        },
      },
      required: ["subject", "message"],
    },
  };

  const CHAT_FALLBACK_PREFIX =
    "Compli-ee is currently running in limited guidance mode while AI services are unavailable.";

  const sanitizeChatPrompt = (value: unknown): string =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  const extractLastUserPrompt = (conversation: Array<{ role?: string; content?: string }>): string => {
    for (let i = conversation.length - 1; i >= 0; i -= 1) {
      const candidate = conversation[i];
      if (candidate?.role === "user" && typeof candidate.content === "string") {
        return candidate.content.trim();
      }
    }
    return "";
  };

  const isAdminOnlyTopic = (message: string): boolean =>
    /\b(system logs?|administrator controls?|roi|billing tool|testing features|rostering studio|admin)\b/i.test(
      message
    );

  const isTechnicalTopic = (message: string): boolean =>
    /\b(api|endpoint|database|server|infrastructure|architecture|algorithm|model)\b/i.test(message);

  const wantsInboxMessage = (message: string): boolean =>
    /\b(send|message|remind|put)\b.*\b(inbox|messages?)\b/i.test(message) ||
    /\bremind me\b/i.test(message);

  const buildFallbackSubject = (prompt: string): string => {
    const cleaned = sanitizeChatPrompt(prompt);
    const aboutMatch = cleaned.match(/\b(?:about|regarding|on)\b\s+(.+)$/i);
    const base = aboutMatch?.[1] ? aboutMatch[1] : cleaned;
    if (!base) return "Reminder from Compli-ee";
    const normalized = base.replace(/[.?!]+$/, "");
    return `Reminder: ${normalized}`.slice(0, 120);
  };

  const buildFallbackGuidance = (prompt: string, isAdmin: boolean): string => {
    const normalized = prompt.toLowerCase();

    if (!isAdmin && isAdminOnlyTopic(normalized)) {
      return `${CHAT_FALLBACK_PREFIX}

That feature is administrator-only. Please contact your admin for access.

I can still help with:
- EMAR and visit audit workflows
- Care planning and risk assessment guidance
- Drafting clear team or family communications`;
    }

    if (isTechnicalTopic(normalized)) {
      return `${CHAT_FALLBACK_PREFIX}

Ah, that is backstage wizardry I cannot unpack directly. I can still help with practical platform steps.

Tell me what you are trying to achieve and I will map it to the right workflow.`;
    }

    if (/\bemar|medication|prn|refusal\b/i.test(normalized)) {
      return `${CHAT_FALLBACK_PREFIX}

For EMAR audits:
1. Go to Care Workers -> EMAR Audit.
2. Upload a PDF EMAR and run Quick Check first.
3. Start AI analysis when available, or use manual checklist mode if AI is offline.
4. Review refusals, PRN protocols, and discrepancies.
5. Save the audit record for traceability.`;
    }

    if (/\brisk assessment|risk\b/i.test(normalized)) {
      return `${CHAT_FALLBACK_PREFIX}

For risk assessments:
1. Open Service Users -> Risk Assessment.
2. Upload or paste supporting information.
3. Draft hazards, existing controls, and required actions.
4. Confirm ownership and review dates.
5. Save and share with the care team.`;
    }

    if (/\bcare plan|care planning|plan enhancer\b/i.test(normalized)) {
      return `${CHAT_FALLBACK_PREFIX}

For care planning:
1. Open Service Users -> Care Planning.
2. Select the person and source documents.
3. Generate or edit each section with clear person-centred language.
4. Review actions, escalation notes, and responsibilities.
5. Finalize and save for distribution.`;
    }

    if (/\bvisit audit|visit\b/i.test(normalized)) {
      return `${CHAT_FALLBACK_PREFIX}

For visit audits:
1. Open Care Workers -> Visit Audit.
2. Upload call data export.
3. Review missed visits, timing variances, and documentation gaps.
4. Record follow-up actions and communicate to team leads.`;
    }

    return `${CHAT_FALLBACK_PREFIX}

I can still help with navigation and workflow guidance:
- Care Workers -> EMAR Audit / Visit Audit / Performance
- Service Users -> Care Planning / Risk Assessment / Plan Enhancer
- Messages for reminders and team notes

Tell me the task you want to complete and I will give step-by-step guidance.`;
  };

  const buildFallbackChatResponse = async (
    prompt: string,
    req: any,
    fallbackReason: string,
    isAdmin: boolean
  ): Promise<{ reply: string; messageSent: boolean; mode: "fallback"; fallbackReason: string }> => {
    let messageSent = false;
    const cleanedPrompt = sanitizeChatPrompt(prompt);

    if (cleanedPrompt && wantsInboxMessage(cleanedPrompt) && req.user?.id) {
      const subject = buildFallbackSubject(cleanedPrompt);
      const body = [
        "This reminder was created while Compli-ee was running in limited guidance mode.",
        "",
        `Original request: ${cleanedPrompt}`,
        "",
        `Saved at: ${new Date().toISOString()}`,
      ].join("\n");

      try {
        await storage.createUserMessage({
          recipientId: req.user.id,
          senderId: null,
          senderName: "Compli-ee",
          subject,
          message: body.slice(0, 10000),
          priority: "normal",
        });
        messageSent = true;
        console.log(`[Chat Assistant] Fallback reminder sent to ${req.user?.username}: "${subject}"`);
      } catch (messageError: any) {
        console.error("[Chat Assistant] Failed to send fallback reminder:", messageError?.message || messageError);
      }
    }

    const baseReply = buildFallbackGuidance(cleanedPrompt, isAdmin);
    const reply = messageSent
      ? `${baseReply}

I have also sent that reminder to your Messages inbox.`
      : baseReply;

    return {
      reply,
      messageSent,
      mode: "fallback",
      fallbackReason,
    };
  };

  const handleAssistantChat = async (req: any, res: any) => {
    const chatPIIVault = new PIIVault();
    try {
      const { messages } = req.body;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ message: "messages array is required" });
      }

      // Limit conversation history to prevent token overflow
      const recentMessages = messages.slice(-10);
      const lastUserPrompt = extractLastUserPrompt(recentMessages);

      const isAdmin = req.user?.role === "admin";

      const readiness = await getAIProviderReadiness();
      if (!isAIEnabled() || !readiness.providerConfigured) {
        const fallbackReason = !isAIEnabled()
          ? getAIDisabledMessage()
          : readiness.providerIssue || "AI provider is currently unavailable.";
        const fallback = await buildFallbackChatResponse(lastUserPrompt, req, fallbackReason, isAdmin);
        return res.json(fallback);
      }
      
      // Customize system prompt based on user role
      const roleContext = isAdmin
        ? "\n\n## USER CONTEXT\nThis user IS an administrator - you can discuss admin features with them."
        : "\n\n## USER CONTEXT\nThis user is NOT an administrator - do NOT discuss admin areas with them.";

      const aiUserContext: AiUserContext = { 
        userId: req.user?.id || null, 
        username: req.user?.username || null 
      };

      const completion = await executeSecureChatCompletion({
        endpoint: "/api/ai/chat",
        feature: "chat-assistant",
        model: getLowCostModel(), // temporarily low cost mode override
        userContext: aiUserContext,
        vault: chatPIIVault,
        messages: [
          { role: "system", content: CHAT_ASSISTANT_SYSTEM_PROMPT + roleContext },
          ...recentMessages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        ],
        tools: [{ type: "function", function: SEND_MESSAGE_FUNCTION }],
        temperature: 0.7,
        maxCompletionTokens: 800,
      });

      const assistantMessage = completion.choices[0]?.message;
      
      // Check if AI wants to call the send_message function
      if (assistantMessage?.tool_calls?.length) {
        const toolCall = assistantMessage.tool_calls[0] as any;
        if (toolCall?.function?.name === "send_message") {
          try {
            const args = JSON.parse(toolCall.function.arguments || "{}");
            
            // Restore PII in message content before storing in inbox
            await storage.createUserMessage({
              recipientId: req.user.id,
              senderId: null, // null = Compli-ee
              senderName: "Compli-ee",
              subject: chatPIIVault.restoreString((args.subject || "Message from Compli-ee").slice(0, 200)),
              message: chatPIIVault.restoreString((args.message || "").slice(0, 10000)),
              priority: args.priority || "normal",
            });
            
            console.log(`[Chat Assistant] Compli-ee sent message to ${req.user.username}: "${args.subject}"`);
            
            // Get a follow-up response from AI confirming the message was sent
            const followUp = await executeSecureChatCompletion({
              endpoint: "/api/ai/chat",
              feature: "chat-assistant",
              model: getLowCostModel(), // temporarily low cost mode override
              userContext: aiUserContext,
              vault: chatPIIVault,
              messages: [
                { role: "system", content: CHAT_ASSISTANT_SYSTEM_PROMPT + roleContext },
                ...recentMessages.map((m: { role: string; content: string }) => ({
                  role: m.role,
                  content: m.content,
                })),
                assistantMessage as any,
                { 
                  role: "tool", 
                  tool_call_id: toolCall.id, 
                  content: JSON.stringify({ success: true, message: "Message sent successfully to user's inbox" }) 
                },
              ],
              temperature: 0.7,
              maxCompletionTokens: 300,
            });
            
            const rawReply = followUp.choices[0]?.message?.content || "Done! I've sent that to your Messages inbox. 📬";
            const reply = chatPIIVault.restoreString(rawReply);
            chatPIIVault.logAudit('RESTORE', '/api/ai/chat', req.user?.id, req.user?.username);
            return res.json({ reply, messageSent: true });
          } catch (parseError) {
            console.error("[Chat Assistant] Failed to parse function call:", parseError);
            return res.json({ 
              reply: "I tried to send that to your inbox but something went wrong. Could you try asking me again?",
              messageSent: false 
            });
          }
        }
      }

      const rawReply = assistantMessage?.content || "I'm sorry, I couldn't generate a response.";
      const reply = chatPIIVault.restoreString(rawReply);
      chatPIIVault.logAudit('RESTORE', '/api/ai/chat', req.user?.id, req.user?.username);

      console.log(`[Chat Assistant] Response generated for ${req.user?.username}`);
      return res.json({ reply });
    } catch (error: any) {
      const errorMessage = String(error?.message || "Failed to generate response");
      const normalized = errorMessage.toLowerCase();
      const errorCode = String(error?.code || "");
      const fallbackMessages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-10) : [];
      const fallbackPrompt = extractLastUserPrompt(fallbackMessages);
      const isAdmin = req.user?.role === "admin";

      console.error("[Chat Assistant] Error:", errorMessage);

      if (errorCode === "AI_DISABLED" || normalized.includes("ai features are disabled")) {
        const fallback = await buildFallbackChatResponse(
          fallbackPrompt,
          req,
          getAIDisabledMessage(),
          isAdmin
        );
        return res.status(200).json(fallback);
      }

      if (
        normalized.includes("not configured") ||
        normalized.includes("no ai configured") ||
        normalized.includes("local llm")
      ) {
        const fallback = await buildFallbackChatResponse(fallbackPrompt, req, errorMessage, isAdmin);
        return res.status(200).json(fallback);
      }

      if (error?.status === 429 || normalized.includes("rate limit")) {
        const fallback = await buildFallbackChatResponse(
          fallbackPrompt,
          req,
          "Compli-ee is temporarily rate-limited. Limited guidance mode is active.",
          isAdmin
        );
        return res.status(200).json(fallback);
      }

      try {
        const fallback = await buildFallbackChatResponse(
          fallbackPrompt,
          req,
          "Compli-ee hit a temporary issue and switched to limited guidance mode.",
          isAdmin
        );
        return res.status(200).json(fallback);
      } catch (fallbackError: any) {
        console.error("[Chat Assistant] Fallback response failed:", fallbackError?.message || fallbackError);
        return res.status(500).json({ message: "Failed to generate response" });
      }
    } finally {
      chatPIIVault.clear();
    }
  };

  app.post("/api/ai/chat", requireAuth, handleAssistantChat);
  app.post("/api/chat", requireAuth, handleAssistantChat);

  // ═══════════════════════════════════════════════════════════════════════════
  // UK GDPR COMPLIANCE ENDPOINTS  →  server/routes/gdpr.ts
  // ═══════════════════════════════════════════════════════════════════════════
  registerGdprRoutes(app, { requireAuth, requireAdmin });

  // ==========================================================================
  // Modular Route Modules
  // ==========================================================================
  // These route groups have been extracted into dedicated files under
  // server/routes/ for better organisation and maintainability.
  registerClientErrorRoutes(app);
  registerHandoverRoutes(app, { requireAuth });
  registerTrainingRoutes(app, { requireAuth });
  registerPolicyAcknowledgementRoutes(app, { requireAuth });

  return httpServer;
} 