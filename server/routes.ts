import type { Express } from "express";
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
import { insertUserSchema, insertCareWorkerSchema, insertDiscrepancySchema, insertAuditSchema, insertAdminAlertSchema, insertPolicyDocumentSchema, insertContactMessageSchema, insertSystemLogSchema } from "@shared/schema";
import { createChatCompletion, createChatCompletionWithLogging, openai, getPreferredProvider, setPreferredProvider, getPreferredModel, type AiUserContext, type AiProvider } from "./services/aiClient";
import { emarAgent } from "./services/emarAgent";
import multer from "multer";
import mammoth from "mammoth";
import { scanFile, computeFileHash, getCachedScan } from "./services/fileScan";
import * as XLSX from "xlsx";
import { convertPdfToImages } from "./services/pdfToImages";
import { analyzeBillingRows } from "./services/billingAnalyzer";
import { extractSupportPlanDataFromText, compareSupportPlanToServiceOrders, type ServiceOrderComparisonInput } from "./services/supportPlanCompare";
import { parse as parseDateFns, format as formatDateFns } from "date-fns";
// Use legacy build for Node.js (no DOM APIs required)
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseEMARGrid, type ParsedEMAR } from "./emarGridParser";
// Vision-based extraction for improved EMAR accuracy

const execFileAsync = promisify(execFile);

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isPdf = file.mimetype === "application/pdf" || name.endsWith(".pdf");
    const isDocx = file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx");
    const isDoc = file.mimetype === "application/msword" || name.endsWith(".doc");
    if (isPdf || isDocx || isDoc) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and Word files are allowed"));
    }
  }
});

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isExcel = file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                    file.mimetype === "application/vnd.ms-excel" ||
                    file.originalname.toLowerCase().endsWith(".xlsx") ||
                    file.originalname.toLowerCase().endsWith(".xls");
    const isCSV = file.mimetype === "text/csv" ||
                  file.mimetype === "application/csv" ||
                  file.originalname.toLowerCase().endsWith(".csv");
    if (isExcel || isCSV) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) or CSV files are allowed"));
    }
  }
});

const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = file.mimetype || "";
    const name = file.originalname.toLowerCase();
    const isPng = mime === "image/png" || name.endsWith(".png");
    if (isPng) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG images are allowed"));
    }
  },
});

const MAX_NON_ADMIN_SESSIONS = 2;
const FORCE_LOGOUT_WARNING_SECONDS = 30;
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

type LoginAttempt = {
  count: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  blockedUntil?: number;
};

const loginAttempts = new Map<string, LoginAttempt>();

const validatePassword = (password: string): string | null => {
  if (!password || typeof password !== "string") {
    return "Password is required.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!PASSWORD_COMPLEXITY_REGEX.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
};

const getLoginAttemptKey = (ip: string | null, username?: string): string => {
  if (ip && ip !== "unknown") return `ip:${ip}`;
  if (username) return `user:${username.toLowerCase()}`;
  return "unknown";
};

const pruneLoginAttempts = (): void => {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts.entries()) {
    const expired = now - attempt.lastAttemptAt > LOGIN_ATTEMPT_WINDOW_MS;
    const blockExpired = !attempt.blockedUntil || attempt.blockedUntil <= now;
    if (expired && blockExpired) {
      loginAttempts.delete(key);
    }
  }
};

const getBlockedSeconds = (key: string): number => {
  const attempt = loginAttempts.get(key);
  if (!attempt || !attempt.blockedUntil) return 0;
  const remainingMs = attempt.blockedUntil - Date.now();
  if (remainingMs <= 0) {
    loginAttempts.delete(key);
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
};

const recordLoginFailure = (key: string): void => {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt || now - attempt.firstAttemptAt > LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now, lastAttemptAt: now });
    return;
  }
  attempt.count += 1;
  attempt.lastAttemptAt = now;
  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    attempt.blockedUntil = now + LOGIN_BLOCK_DURATION_MS;
  }
};

const clearLoginFailures = (key: string): void => {
  loginAttempts.delete(key);
};

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
      error: `File scan failed: ${error.message}. Please try again later.`,
    };
  }
}

// Billing tool helpers
const BILLING_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type BillingDayKey = typeof BILLING_DAY_KEYS[number];
type BillingDayCounts = Record<BillingDayKey, number>;

const normalizeDate = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return normalizeDate(next);
};

const differenceInDays = (start: Date, end: Date): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((normalizeDate(end).getTime() - normalizeDate(start).getTime()) / msPerDay);
};

const startOfWeekMonday = (date: Date): Date => {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return addDays(normalizeDate(date), -diff);
};

const parseDateInput = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})[\\/-](\d{1,2})[\\/-](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return normalizeDate(date);
    }
    return null;
  }

  const match = trimmed.match(/(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{2,4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
    return normalizeDate(date);
  }
  return null;
};

const formatDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
};

const parseInteger = (value: any): number => {
  if (value === null || value === undefined) return 0;
  const match = String(value).match(/-?\\d+/);
  if (!match) return 0;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeTime = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/(\\d{1,2})[:.](\\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const parseTimeToMinutes = (value?: string | null): number | null => {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, mins] = normalized.split(":").map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
};

const parseDurationMinutes = (value?: string | null): number | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const timeMatch = trimmed.match(/(\\d{1,2})[:.](\\d{2})/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const mins = Number(timeMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(mins)) {
      return hours * 60 + mins;
    }
  }

  const hourMatch = trimmed.match(/(\\d+(?:\\.\\d+)?)\\s*h/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (Number.isFinite(hours)) return Math.round(hours * 60);
  }

  const minMatch = trimmed.match(/(\\d+(?:\\.\\d+)?)\\s*m/i);
  if (minMatch) {
    const mins = Number(minMatch[1]);
    if (Number.isFinite(mins)) return Math.round(mins);
  }

  return null;
};

const formatDurationFromMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const getBillingDayIndex = (date: Date): number => (date.getDay() + 6) % 7;

const getBillingDayKey = (date: Date): BillingDayKey => BILLING_DAY_KEYS[getBillingDayIndex(date)];

const getWeekIndex = (start: Date, date: Date): number => {
  const startWeek = startOfWeekMonday(start);
  const dateWeek = startOfWeekMonday(date);
  const diffDays = differenceInDays(startWeek, dateWeek);
  return Math.floor(diffDays / 7);
};

const parseJsonFromModel = (content: string): any => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const startCandidates = [candidate.indexOf("{"), candidate.indexOf("[")].filter((idx) => idx >= 0);
  const endIndex = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (startCandidates.length === 0 || endIndex < 0) {
    throw new Error("Model response did not contain JSON");
  }
  const startIndex = Math.min(...startCandidates);
  const jsonText = candidate.slice(startIndex, endIndex + 1);
  return JSON.parse(jsonText);
};

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
  const fallbackModel = "gpt-4o";

  const runExtraction = async (model: string) =>
    createChatCompletionWithLogging(
      {
        model,
        temperature: 0,
        max_tokens: 1600,
        messages: [
          { role: "system", content: "You extract structured data from images." },
          {
            role: "user",
            content: [
              { type: "text", text: BILLING_EXTRACTION_PROMPT },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
      },
      "billing-tool-extract",
      userContext
    );

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

  const content = completion.choices?.[0]?.message?.content || "";
  if (!content.trim()) return [];
  const parsed = parseJsonFromModel(content);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  throw new Error("Model response did not return any rows");
}

const connectedClients: Map<string, WebSocket> = new Map();
let sessionStore: any = null;

const CLINICAL_WHITELIST = new Set([
  "alzheimer",
  "parkinson",
  "huntington",
  "crohn",
  "addison",
  "hodgkin",
  "raynaud",
  "bartholin",
  "cushing",
  "graves",
  "hashimoto",
  "meniere",
  "paget",
  "bell",
  "down syndrome",
  "turner syndrome",
  "klinefelter",
  "marfan",
  "ehlers danlos",
  "asperger",
  "guillain barre",
  "lou gehrig",
  "wilson disease",
  "bright disease",
]);

function isClinicalTerm(phrase: string): boolean {
  return CLINICAL_WHITELIST.has(phrase.toLowerCase());
}

function scrubPII(data: any): any {
  if (typeof data === "string") {
    let scrubbed = data;

    scrubbed = scrubbed.replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, "[REDACTED]");

    scrubbed = scrubbed.replace(/\b(my name is|i am called|i'm called|call me)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*/gi, "$1 [SERVICE USER]");

    scrubbed = scrubbed.replace(/\b([A-Z][a-z]+)'s\b/g, (match, name) => {
      return isClinicalTerm(name) ? match : "[SERVICE USER]'s";
    });

    scrubbed = scrubbed.replace(
      /\b([A-Z][a-z]+)\s+((?:O'|Mc|Mac)?[A-Z][a-z]+)(?:\s+((?:O'|Mc|Mac)?[A-Z][a-z]+))?\b/g,
      (match, first, second) => {
        const whitelist = [
          "care plan",
          "care worker",
          "care home",
          "care needs",
          "risk assessment",
          "personal care",
          "mental health",
          "social worker",
          "general practitioner",
          "district nurse",
          "care staff",
          "care team",
          "health visitor",
          "care manager",
          "service user",
          "family member",
          "next of kin",
          "emergency contact",
          "falls prevention",
          "fire safety",
          "skin integrity",
          "medication administration",
          "infection control",
          "environmental safety",
          "lone working",
          "behavior support",
          "communication support",
          "dementia care",
          "end of life",
          "epilepsy management",
          "diabetes management",
          "nutrition assessment",
          "continence care",
          "mobility assessment",
          "moving and handling",
          "safeguarding adults",
          "safeguarding children",
          "coshh assessment",
          "manual handling",
          "pressure areas",
          "tissue viability",
          "wound care",
          "initial assessment",
          "care planning",
          "daily living",
          "personal hygiene",
          "oral care",
          "food preparation",
          "medication support",
          "emotional support",
          "social activities",
          "blood pressure",
          "heart rate",
          "respiratory rate",
          "oxygen saturation",
          "body temperature",
          "weight management",
          "pain management",
          "symptom control",
          "palliative care",
          "health and safety",
          "dignity and respect",
          "person centred",
          "person centered",
          "best practice",
          "quality assurance",
          "clinical governance",
          "duty of care",
        ];

        if (
          isClinicalTerm(match) ||
          isClinicalTerm(first) ||
          isClinicalTerm(second) ||
          whitelist.includes(match.toLowerCase())
        ) {
          return match;
        }
        return "[SERVICE USER]";
      }
    );

    return scrubbed;
  }

  if (Array.isArray(data)) {
    return data.map((item) => scrubPII(item));
  }
  if (typeof data === "object" && data !== null) {
    const scrubbed: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      scrubbed[key] = scrubPII(data[key]);
    }
    return scrubbed;
  }
  return data;
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

const sanitizeNarrativeText = (text: string): string => {
  if (!text) return text;
  let cleaned = text;

  cleaned = cleaned.replace(/\[(service user)\]/gi, "I");
  cleaned = cleaned.replace(/\[(redacted)\]/gi, "on file");

  cleaned = cleaned.replace(/\b(DOB|Date of birth)\s*[:\-]?\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/gi, "$1 on file");

  cleaned = cleaned.replace(
    /\b(Emergency contact|Next of kin|Contact)\s*[:\-]?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g,
    "$1 on file"
  );

  cleaned = cleaned.replace(
    /\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g,
    (match, title) => {
      const lower = String(title || "").toLowerCase();
      if (lower === "dr") return "my doctor";
      return "someone";
    }
  );

  cleaned = cleaned.replace(
    /\b(my)\s+(mother|father|son|daughter|husband|wife|partner|brother|sister|family member|next of kin|friend)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/gi,
    (_match, prefix, relation) => `${prefix} ${relation}`
  );

  cleaned = cleaned.replace(
    /\b(care worker|carer|support worker|nurse|doctor|gp|social worker|physio|ot|therapist|care manager|care coordinator)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/gi,
    (_match, role) => role
  );

  return cleaned;
};

const sanitizeNarrativePII = (data: any): any => {
  if (typeof data === "string") {
    return sanitizeNarrativeText(data);
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

// Validate and normalize service user initials
function normalizeInitials(name: string | undefined | null): string {
  if (!name) return 'N.N.';
  const trimmed = name.trim();
  if (!trimmed) return 'N.N.';
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

const getLowCostModel = () => "gpt-4o-mini";
const getAccurateModel = () => getPreferredModel();

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

const ASSESSMENT_EVIDENCE_TERMS: Record<string, string[]> = {
  "nutrition": ["nutrition", "feed", "meal", "diet", "hydration", "swallow", "appetite"],
  "diabetes management": ["diabet"],
  "epilepsy management": ["epilep", "seizure"],
  "medication administration": ["medication", "medicine", "tablet", "drug", "prescription", "inhaler", "drops", "cream"],
  "mobility and moving and handling": ["mobility", "transfer", "moving", "handling", "hoist", "wheelchair", "frame", "walk"],
  "personal care": ["personal care", "wash", "bathing", "shower", "toilet", "dressing", "groom", "oral care"],
  "skin integrity": ["skin", "pressure", "ulcer", "wound"],
  "falls prevention": ["fall", "falls", "unsteady", "trip"],
  "continence care": ["continence", "incontinence", "catheter"],
  "dementia care": ["dementia", "cognit", "alzheimer"],
  "mental health": ["mental health", "depress", "anxiety", "bipolar", "psych"],
  "communication": ["communication", "speech", "hearing", "vision", "aphasia"],
  "behavior support": ["behaviour", "behavior", "challenging", "aggression"],
  "end of life care": ["palliative", "end of life", "terminal"],
  "infection control": ["infection", "wound", "catheter", "mrsa"],
  "fire safety": ["fire", "smoking", "smoke alarm"],
  "environmental safety": ["environment", "hazard", "trip", "clutter"],
  "lone working": ["lone working", "single carer", "alone"],
  "safeguarding": ["safeguard", "abuse", "neglect"],
  "coshh": ["coshh", "chemical", "cleaning"],
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

const buildAssessmentRecommendations = (analysis: {
  medicalConditions?: string[];
  careActivities?: string[];
  concerns?: string[];
}): { name: string; isMandatory: boolean; reason: string; evidence?: string }[] => {
  const recommendations: { name: string; isMandatory: boolean; reason: string; evidence?: string }[] = [];
  const add = (name: string, reason: string, evidence?: string) => {
    recommendations.push({ name, isMandatory: true, reason, evidence });
  };

  const addIfEvidence = (name: string, terms: string[], reason: string) => {
    const evidenceMatches = collectAssessmentEvidence(analysis, terms);
    if (evidenceMatches.length === 0) return;
    add(name, reason, truncateEvidence(evidenceMatches.join("; ")));
  };

  addIfEvidence("Diabetes Management", ASSESSMENT_EVIDENCE_TERMS["diabetes management"], "Document notes diabetes.");
  addIfEvidence("Epilepsy Management", ASSESSMENT_EVIDENCE_TERMS["epilepsy management"], "Document notes epilepsy or seizures.");
  addIfEvidence("Medication Administration", ASSESSMENT_EVIDENCE_TERMS["medication administration"], "Document indicates medication support is required.");
  addIfEvidence("Nutrition", ASSESSMENT_EVIDENCE_TERMS["nutrition"], "Document indicates nutrition or hydration support.");
  addIfEvidence("Mobility & Moving and Handling", ASSESSMENT_EVIDENCE_TERMS["mobility and moving and handling"], "Document indicates mobility or transfer support.");
  addIfEvidence("Personal Care", ASSESSMENT_EVIDENCE_TERMS["personal care"], "Document indicates personal care support.");
  addIfEvidence("Skin Integrity", ASSESSMENT_EVIDENCE_TERMS["skin integrity"], "Document indicates skin integrity or pressure area concerns.");
  addIfEvidence("Falls Prevention", ASSESSMENT_EVIDENCE_TERMS["falls prevention"], "Document indicates fall risk or poor mobility.");
  addIfEvidence("Continence Care", ASSESSMENT_EVIDENCE_TERMS["continence care"], "Document indicates continence support.");
  addIfEvidence("Dementia Care", ASSESSMENT_EVIDENCE_TERMS["dementia care"], "Document indicates cognitive impairment.");
  addIfEvidence("Mental Health", ASSESSMENT_EVIDENCE_TERMS["mental health"], "Document indicates mental health support.");
  addIfEvidence("Communication", ASSESSMENT_EVIDENCE_TERMS["communication"], "Document indicates communication or sensory support.");
  addIfEvidence("Behavior Support", ASSESSMENT_EVIDENCE_TERMS["behavior support"], "Document indicates behaviour support needs.");
  addIfEvidence("End of Life Care", ASSESSMENT_EVIDENCE_TERMS["end of life care"], "Document indicates end of life or palliative care.");
  addIfEvidence("Infection Control", ASSESSMENT_EVIDENCE_TERMS["infection control"], "Document indicates infection control considerations.");
  addIfEvidence("Fire Safety", ASSESSMENT_EVIDENCE_TERMS["fire safety"], "Document indicates fire safety considerations.");
  addIfEvidence("Environmental Safety", ASSESSMENT_EVIDENCE_TERMS["environmental safety"], "Document indicates environmental hazards.");
  addIfEvidence("Lone Working", ASSESSMENT_EVIDENCE_TERMS["lone working"], "Document indicates lone working considerations.");
  addIfEvidence("Safeguarding", ASSESSMENT_EVIDENCE_TERMS["safeguarding"], "Document indicates safeguarding concerns.");
  addIfEvidence("COSHH", ASSESSMENT_EVIDENCE_TERMS["coshh"], "Document indicates chemical or cleaning product handling.");

  return recommendations;
};

const mergeAssessmentRecommendations = (
  existing: Array<{ name: string; isMandatory?: boolean; reason?: string; evidence?: string }> = [],
  derived: Array<{ name: string; isMandatory?: boolean; reason?: string; evidence?: string }> = []
) => {
  const merged = new Map<string, { name: string; isMandatory: boolean; reason: string; evidence?: string }>();
  const apply = (item: { name: string; isMandatory?: boolean; reason?: string; evidence?: string }) => {
    if (!item?.name) return;
    const key = normalizeAssessmentName(item.name);
    if (!key) return;
    const normalized = {
      name: item.name.trim(),
      isMandatory: Boolean(item.isMandatory),
      reason: item.reason?.trim() || "Document indicates this assessment is required.",
      evidence: item.evidence?.trim() || "",
    };
    const current = merged.get(key);
    if (!current) {
      merged.set(key, normalized);
      return;
    }
    current.isMandatory = current.isMandatory || normalized.isMandatory;
    if (!current.reason && normalized.reason) current.reason = normalized.reason;
    if (!current.evidence && normalized.evidence) current.evidence = normalized.evidence;
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
  recommendations: Array<{ name: string; isMandatory?: boolean; reason?: string; evidence?: string }>,
  analysis: { medicalConditions?: string[]; careActivities?: string[]; concerns?: string[]; documentSummary?: string }
) =>
  recommendations.map((item) => {
    const evidenceTerms = ASSESSMENT_EVIDENCE_TERMS[normalizeAssessmentName(item.name)] || [];
    if (item.evidence && item.evidence.trim()) {
      return item;
    }
    if (evidenceTerms.length === 0) return item;
    const evidenceMatches = collectAssessmentEvidence(analysis, evidenceTerms);
    if (evidenceMatches.length > 0) {
      return {
        ...item,
        evidence: truncateEvidence(evidenceMatches.join("; ")),
      };
    }
    const summary = analysis.documentSummary || "";
    const summaryEvidence = extractSummaryEvidence(summary, evidenceTerms);
    if (!summaryEvidence) return item;
    return {
      ...item,
      evidence: summaryEvidence,
    };
  });

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
    const response = await createChatCompletionWithLogging({
      model: getAccurateModel(),
      messages: [
        {
          role: "system",
          content: `You are a UK pharmacist. Check for dangerous drug interactions in this medication list. Focus on:
- Blood thinners (warfarin, apixaban, rivaroxaban) + NSAIDs/aspirin
- Opioids + benzodiazepines/sedatives
- ACE inhibitors + potassium-sparing diuretics
- Methotrexate + NSAIDs
- SSRIs + MAOIs or tramadol
- Digoxin + amiodarone/verapamil

Return JSON: {"interactions": [{"drug1": "Name1", "drug2": "Name2", "severity": "high|moderate|low", "description": "Brief clinical concern"}]}
If none found: {"interactions": []}`
        },
        {
          role: "user",
          content: `Check for interactions: ${medList}`
        }
      ],
      max_completion_tokens: 800,
      temperature: 0,
      seed: deterministicSeed,
      response_format: { type: "json_object" }
    }, "drug_interactions", userContext);

    const content = response.choices[0]?.message?.content || "";
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
  } catch (error: any) {
    console.error("[Drug Interactions] Check failed:", error.message);
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
  
  // WebSocket server for real-time notifications (logout warnings)
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const userId = url.searchParams.get("userId");

    if (userId) {
      connectedClients.set(userId, ws);

      ws.on("close", () => {
        connectedClients.delete(userId);
      });

      ws.on("error", () => {
        connectedClients.delete(userId);
      });
    }
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

  const DEFAULT_SESSION_SECRET = "carecompli-secret-key-change-in-prod";
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === DEFAULT_SESSION_SECRET)
  ) {
    throw new Error("SESSION_SECRET must be set to a strong value in production.");
  }

  // Session store: prefer Postgres when available, fall back to in-memory for local dev
  if (hasDatabaseUrl) {
    const PgSession = connectPgSimple(session);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    sessionStore = new PgSession({ pool, createTableIfMissing: true });
  } else {
    sessionStore = null;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Auth] DATABASE_URL not set. Using in-memory sessions and enabling demo login for development.");
    }
  }

  // Trust proxy so secure cookies work when behind reverse proxies
  app.set("trust proxy", 1);

  // Session middleware (skip for Vite HMR WebSocket)
  const sessionMiddleware = session({
    ...(sessionStore ? { store: sessionStore } : {}),
    secret: process.env.SESSION_SECRET || "carecompli-secret-key-change-in-prod",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
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

  // Auth middleware
  const requireAuth = async (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Handle demo sessions with virtual user
    if (req.session.isDemo) {
      req.user = {
        id: req.session.userId,
        username: "demo_user",
        firstName: "Demo",
        lastName: "User",
        email: "demo@careassurance.co.uk",
        role: "staff",
        status: "active",
        isDemo: true,
        createdAt: new Date(),
        dashboardWidgets: null,
      };
      return next();
    }
    
    const user = await storage.getUser(req.session.userId);
    if (!user || user.status !== "active") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Check if session is still valid in active_sessions
    const activeSession = await storage.getActiveSessionBySessionId(req.sessionID);
    if (!activeSession || String(activeSession.userId) !== String(req.session.userId)) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Session expired" });
    }
    
    // Update last activity
    await storage.updateSessionActivity(req.sessionID);
    
    req.user = user;
    const shouldLog = req.path.startsWith("/api") &&
      !req.path.startsWith("/api/system-logs") &&
      req.path !== "/api/auth/me" &&
      req.method !== "OPTIONS";
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

  const requireAdmin = async (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
  };

  const blockDemoWrites = async (req: any, res: any, next: any) => {
    if (req.user?.isDemo) {
      return res.status(403).json({ 
        message: "Demo mode: Changes are not saved. Sign up to access all features." 
      });
    }
    next();
  };

  // ===== AUTH ROUTES =====
  
  // Helper to get client IP address
  const getClientIp = (req: any): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || 'unknown';
  };

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
        return res.status(429).json({
          message: `Too many login attempts. Try again in ${blockedSeconds} seconds.`,
        });
      }
      
      // Check if IP is blocked
      if (clientIp && clientIp !== 'unknown') {
        const isBlocked = await storage.isIpBlocked(clientIp);
        if (isBlocked) {
          return res.status(403).json({ message: "Access denied. Your IP address has been blocked." });
        }
      }
      
      if (!usernameValue || !password || typeof password !== "string") {
        recordLoginFailure(attemptKey);
        return res.status(400).json({ message: "Username and password required" });
      }

      const user = await storage.getUserByUsername(usernameValue);
      
      if (!user) {
        recordLoginFailure(attemptKey);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await storage.verifyPassword(password, user.password);
      if (!isValidPassword) {
        recordLoginFailure(attemptKey);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.status !== "active") {
        recordLoginFailure(attemptKey);
        return res.status(403).json({ message: "Account pending approval" });
      }

      // Check if user is suspended
      if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.suspendedUntil).getTime() - Date.now()) / 60000);
        recordLoginFailure(attemptKey);
        return res.status(403).json({ 
          message: `Account suspended. Please try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
        });
      }

      // Check session limits for non-admin users
      const isAdmin = user.role === "admin";
      const existingSession = await storage.getActiveSessionByUserId(user.id);
      const nonAdminCount = await storage.getNonAdminSessionCount();
      
      let forcingLogout = false;
      
      if (!isAdmin && nonAdminCount >= MAX_NON_ADMIN_SESSIONS && !existingSession) {
        return res.status(503).json({ 
          message: `System is at capacity (${MAX_NON_ADMIN_SESSIONS} users). Please try again later.` 
        });
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
      
      // Create session history entry with IP address
      await storage.createSessionHistory({
        userId: user.id,
        username: user.username,
        sessionId: req.sessionID,
        ipAddress: clientIp !== 'unknown' ? clientIp : null,
      });
      
      // Update last online
      await storage.updateLastOnlineAt(user.id);
      
      return res.json({
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
      return res.status(500).json({ message: error.message });
    }
  });

  // Demo Login (development only): lets you log in without a database.
  if (process.env.NODE_ENV !== "production") {
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

        return res.json(demoUser);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    });
  }

  // Register (creates pending user)
  app.post("/api/auth/register", async (req, res) => {
    try {
      if (!hasDatabaseUrl) {
        return res.status(503).json({
          message: "Development database is not configured (DATABASE_URL missing). Registration is disabled in this environment.",
        });
      }

      const validatedData = insertUserSchema.parse(req.body);
      const passwordError = validatePassword(validatedData.password);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...validatedData,
        role: "staff",
        status: "pending",
      });

      return res.status(201).json({ 
        message: "Account created. Awaiting admin approval.",
        id: user.id 
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  // Check session
  app.get("/api/auth/me", requireAuth, async (req: any, res) => {
    return res.json({
      id: req.user.id,
      username: req.user.username,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      status: req.user.status,
      jobTitle: req.user.jobTitle,
      termsAcceptedAt: req.user.termsAcceptedAt,
      termsVersion: req.user.termsVersion,
      isDemo: req.user.isDemo || false,
    });
  });

  // Accept terms and conditions
  app.post("/api/auth/accept-terms", requireAuth, async (req: any, res) => {
    try {
      const { version, signatureName, signatureDate } = req.body;
      
      if (!version) {
        return res.status(400).json({ message: "Terms version is required" });
      }
      if (!signatureName || signatureName.trim().length < 2) {
        return res.status(400).json({ message: "Please enter your full name" });
      }
      if (!signatureDate) {
        return res.status(400).json({ message: "Please enter today's date" });
      }

      const updatedUser = await storage.updateUserTermsAcceptance(
        req.user.id, 
        version, 
        signatureName.trim(), 
        signatureDate
      );
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user" });
      }

      // Update session user
      req.user.termsAcceptedAt = updatedUser.termsAcceptedAt;
      req.user.termsVersion = updatedUser.termsVersion || version;
      req.user.termsSignatureName = signatureName.trim();
      req.user.termsSignatureDate = signatureDate;

      return res.json({ 
        success: true, 
        message: "Terms accepted successfully",
        termsAcceptedAt: updatedUser.termsAcceptedAt,
        termsVersion: updatedUser.termsVersion || version,
        termsSignatureName: signatureName.trim(),
        termsSignatureDate: signatureDate,
      });
    } catch (error) {
      console.error("Error accepting terms:", error);
      return res.status(500).json({ message: "Failed to accept terms" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.sessionID;
    
    // Update session history with logout time
    await storage.updateSessionLogout(sessionId, false);
    await storage.deleteActiveSession(sessionId);
    
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ message: "Logged out successfully" });
    });
  });

  // Get active sessions (admin only)
  app.get("/api/active-sessions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const sessions = await storage.getAllActiveSessions();
      return res.json({
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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
    }
  });

  // Create user (Admin)
  app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const passwordError = validatePassword(validatedData.password);
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
      return res.status(500).json({ message: error.message });
    }
  });

  // Approve user
  app.patch("/api/users/:id/approve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = await storage.updateUserStatus(req.params.id, "active");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Reject user (delete)
  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      return res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
    }
  });

  // Update user role
  app.patch("/api/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || !["admin", "staff"].includes(role)) {
        return res.status(400).json({ message: "Valid role required (admin or staff)" });
      }
      const user = await storage.updateUserRole(req.params.id, role);
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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
    }
  });

  // Change own password
  app.patch("/api/auth/password", requireAuth, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }
      
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const isValidPassword = await storage.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      
      const bcrypt = await import("bcrypt");
      const hashedPassword = await bcrypt.default.hash(newPassword, 10);
      await storage.updateUserPassword(req.user.id, hashedPassword);
      
      return res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Admin reset user password
  app.post("/api/admin/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || typeof newPassword !== "string") {
        return res.status(400).json({ message: "New password required" });
      }
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const bcrypt = await import("bcrypt");
      const hashedPassword = await bcrypt.default.hash(newPassword, 10);
      await storage.updateUserPassword(req.params.id, hashedPassword);
      
      return res.json({ message: `Password reset for user ${user.username}` });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== DASHBOARD ROUTES =====

  // Get dashboard stats for last 24 hours
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats24h();
      const recentAlerts = await storage.getRecentAlerts24h();
      return res.json({ stats, recentAlerts });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Get user's dashboard widget preferences
  app.get("/api/dashboard/widgets", requireAuth, async (req: any, res) => {
    try {
      const widgets = await storage.getDashboardWidgets(req.user.id);
      return res.json({ widgets: widgets || null });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Save user's dashboard widget preferences
  app.put("/api/dashboard/widgets", requireAuth, blockDemoWrites, async (req: any, res) => {
    try {
      const { widgets } = req.body;
      if (!Array.isArray(widgets)) {
        return res.status(400).json({ message: "widgets must be an array" });
      }
      await storage.updateDashboardWidgets(req.user.id, widgets);
      return res.json({ message: "Dashboard preferences saved", widgets });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== CARE WORKER ROUTES =====

  // Get all care workers
  app.get("/api/care-workers", requireAuth, async (req, res) => {
    try {
      const workers = await storage.getAllCareWorkers();
      return res.json(workers);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Create care worker
  app.post("/api/care-workers", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const validatedData = insertCareWorkerSchema.parse(req.body);
      const worker = await storage.createCareWorker(validatedData);
      return res.status(201).json(worker);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  // Get care worker with discrepancies
  app.get("/api/care-workers/:id", requireAuth, async (req, res) => {
    try {
      const worker = await storage.getCareWorker(req.params.id);
      if (!worker) {
        return res.status(404).json({ message: "Care worker not found" });
      }
      
      const discrepancies = await storage.getDiscrepanciesByCareWorker(req.params.id);
      
      return res.json({ ...worker, discrepancies });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== DISCREPANCY ROUTES =====

  // Get all discrepancies with care worker info
  app.get("/api/discrepancies", requireAuth, async (req, res) => {
    try {
      const discrepancies = await storage.getAllDiscrepancies();
      return res.json(discrepancies);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Create discrepancy (and check for alert threshold)
  app.post("/api/discrepancies", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const validatedData = insertDiscrepancySchema.parse(req.body);
      const discrepancy = await storage.createDiscrepancy(validatedData);
      
      // Check if this triggers an admin alert (3+ discrepancies of same type)
      const count = await storage.getDiscrepancyCountByType(
        validatedData.careWorkerId,
        validatedData.type
      );
      
      if (count >= 3) {
        const worker = await storage.getCareWorker(validatedData.careWorkerId);
        if (worker) {
          // Create admin alert
          await storage.createAdminAlert({
            careWorkerId: worker.id,
            careWorkerName: worker.name,
            message: `${worker.name} has reached ${count} discrepancies of type "${validatedData.type}"`,
            discrepancyType: validatedData.type,
            discrepancyCount: count,
            isRead: false,
          });
        }
      }
      
      return res.status(201).json(discrepancy);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== AUDIT ROUTES =====

  // Get all audits
  app.get("/api/audits", requireAuth, async (req, res) => {
    try {
      const audits = await storage.getAllAudits();
      return res.json(audits);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== ADMIN ALERT ROUTES =====

  // Get unread alerts (admin only)
  app.get("/api/admin-alerts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const alerts = await storage.getUnreadAdminAlerts();
      return res.json(alerts);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Mark alert as read
  app.patch("/api/admin-alerts/:id/read", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.markAlertAsRead(req.params.id);
      return res.json({ message: "Alert marked as read" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== SYSTEM LOG ROUTES =====

  app.get("/api/system-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getSystemLogs();
      return res.json(logs);
    } catch (error: any) {
      console.error("Failed to fetch system logs:", error);
      return res.status(500).json({ message: "Failed to fetch system logs" });
    }
  });

  app.post("/api/system-logs", requireAuth, blockDemoWrites, async (req: any, res) => {
    try {
      const { eventType, action, target, status, alert, serviceUserInitials, details } = req.body || {};
      const payload = insertSystemLogSchema.parse({
        eventType: typeof eventType === "string" && eventType.trim() ? eventType : "action",
        userId: req.user?.id,
        username: req.user?.username,
        serviceUserInitials: serviceUserInitials || null,
        details: {
          action,
          target,
          status,
          alert,
          ...(details && typeof details === "object" ? details : {}),
        },
      });
      const log = await storage.createSystemLog(payload);
      return res.status(201).json(log);
    } catch (error: any) {
      console.error("Failed to create system log:", error);
      return res.status(400).json({ message: "Failed to create system log" });
    }
  });

  // ===== CARE WORKER ROTA ROUTES =====

  const rotaWeekdayEnum = z.enum([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]);

  const rotaEntrySchema = z.object({
    key: z.string(),
    serviceUserName: z.string().nullable().optional(),
    callTypeLabel: z.string().nullable().optional(),
    timeBandLabel: z.string().nullable().optional(),
    requirementStartMinutes: z.number().nullable().optional(),
    scheduledStartMinutes: z.number().nullable().optional(),
    scheduledEndMinutes: z.number().nullable().optional(),
    durationMinutes: z.number().nullable().optional(),
    shiftMinutes: z.number().nullable().optional(),
    isTimeCritical: z.boolean().optional(),
    isDoubleUp: z.boolean().optional(),
    windowStartMinutes: z.number().nullable().optional(),
    windowEndMinutes: z.number().nullable().optional(),
    isOutsideWindow: z.boolean().optional(),
    hasWindowConflict: z.boolean().optional(),
    suggestedStartMinutes: z.number().nullable().optional(),
  });

  const rotaOverrideSchema = z.object({
    week1Days: z.array(rotaWeekdayEnum).default([]),
    week2Days: z.array(rotaWeekdayEnum).default([]),
    requirementStartMinutes: z.number().nullable().optional(),
  });

  const shiftBarSchema = z.object({
    startMinutes: z.number().nullable().optional(),
    endMinutes: z.number().nullable().optional(),
    durationMinutes: z.number().nullable().optional(),
  });

  const careWorkerRotaPayloadSchema = z.object({
    workerName: z.string().min(1),
    workerKey: z.string().min(1),
    templateWeek: z.enum(["week1", "week2"]),
    templateDay: rotaWeekdayEnum,
    workerStartMinutes: z.number().nullable().optional(),
    workerEndMinutes: z.number().nullable().optional(),
    timeCriticalWindowEnforced: z.boolean().default(false),
    shiftBars: z.array(shiftBarSchema).default([]),
    selectedGroupKeys: z.array(z.string()).default([]),
    optimizedRun: z.array(rotaEntrySchema).default([]),
    overrides: z.record(rotaOverrideSchema).default({}),
  });

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

  const sortKeysDeep = (value: any): any => {
    if (Array.isArray(value)) {
      return value.map(sortKeysDeep);
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, any>>((acc, key) => {
          acc[key] = sortKeysDeep(value[key]);
          return acc;
        }, {});
    }
    return value;
  };

  const normalizeRotaPayload = (payload: z.infer<typeof careWorkerRotaPayloadSchema>) => {
    const overrides = Object.keys(payload.overrides)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
        const override = payload.overrides[key];
        acc[key] = {
          week1Days: [...override.week1Days].sort(),
          week2Days: [...override.week2Days].sort(),
          requirementStartMinutes:
            typeof override.requirementStartMinutes === "number" ? override.requirementStartMinutes : null,
        };
        return acc;
      }, {});

    const optimizedRun = [...payload.optimizedRun]
      .map((entry) => ({
        key: entry.key,
        serviceUserName: entry.serviceUserName ?? null,
        callTypeLabel: entry.callTypeLabel ?? null,
        timeBandLabel: entry.timeBandLabel ?? null,
        requirementStartMinutes:
          typeof entry.requirementStartMinutes === "number" ? entry.requirementStartMinutes : null,
        scheduledStartMinutes: typeof entry.scheduledStartMinutes === "number" ? entry.scheduledStartMinutes : null,
        scheduledEndMinutes: typeof entry.scheduledEndMinutes === "number" ? entry.scheduledEndMinutes : null,
        durationMinutes: typeof entry.durationMinutes === "number" ? entry.durationMinutes : null,
        shiftMinutes: typeof entry.shiftMinutes === "number" ? entry.shiftMinutes : null,
        isTimeCritical: Boolean(entry.isTimeCritical),
        isDoubleUp: Boolean(entry.isDoubleUp),
        windowStartMinutes: typeof entry.windowStartMinutes === "number" ? entry.windowStartMinutes : null,
        windowEndMinutes: typeof entry.windowEndMinutes === "number" ? entry.windowEndMinutes : null,
        isOutsideWindow: Boolean(entry.isOutsideWindow),
        hasWindowConflict: Boolean(entry.hasWindowConflict),
        suggestedStartMinutes: typeof (entry as any).suggestedStartMinutes === "number"
          ? (entry as any).suggestedStartMinutes
          : null,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    const shiftBars = [...payload.shiftBars]
      .map((bar) => ({
        startMinutes: typeof bar.startMinutes === "number" ? bar.startMinutes : null,
        endMinutes: typeof bar.endMinutes === "number" ? bar.endMinutes : null,
        durationMinutes: typeof bar.durationMinutes === "number" ? bar.durationMinutes : null,
      }))
      .sort((a, b) => {
        const aStart = typeof a.startMinutes === "number" ? a.startMinutes : -1;
        const bStart = typeof b.startMinutes === "number" ? b.startMinutes : -1;
        if (aStart !== bStart) return aStart - bStart;
        const aEnd = typeof a.endMinutes === "number" ? a.endMinutes : -1;
        const bEnd = typeof b.endMinutes === "number" ? b.endMinutes : -1;
        return aEnd - bEnd;
      });

    const selectedGroupKeys = Array.from(new Set(payload.selectedGroupKeys)).sort();

    return {
      workerKey: payload.workerKey,
      templateWeek: payload.templateWeek,
      templateDay: payload.templateDay,
      timeCriticalWindowEnforced: Boolean(payload.timeCriticalWindowEnforced),
      workerStartMinutes:
        typeof (payload as any).workerStartMinutes === "number"
          ? (payload as any).workerStartMinutes
          : null,
      workerEndMinutes:
        typeof (payload as any).workerEndMinutes === "number"
          ? (payload as any).workerEndMinutes
          : null,
      shiftBars,
      selectedGroupKeys,
      overrides,
      optimizedRun,
    };
  };

  // Save care worker rota (admin only)
  app.post("/api/admin/care-worker-rotas", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const payload = careWorkerRotaPayloadSchema.parse(req.body);
      const normalized = normalizeRotaPayload(payload);
      const sourceHash = createHash("sha256")
        .update(JSON.stringify(sortKeysDeep(normalized)))
        .digest("hex");

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
      return res.status(500).json({ message: error.message });
    }
  });

  // Get care worker rotas (admin only)
  app.get("/api/admin/care-worker-rotas", requireAuth, requireAdmin, async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const rotas = await storage.getCareWorkerRotas({ search });
      return res.json(rotas);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
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
      const normalized = normalizeRotaPayload(payload);
      const sourceHash = createHash("sha256")
        .update(JSON.stringify(sortKeysDeep(normalized)))
        .digest("hex");

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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
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
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== POLICY DOCUMENT ROUTES =====

  app.get("/api/policy-documents", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getAllPolicyDocuments();
      return res.json(docs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/policy-documents/category/:category", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getPolicyDocumentsByCategory(req.params.category);
      return res.json(docs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/policy-documents", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertPolicyDocumentSchema.parse(req.body);
      const doc = await storage.createPolicyDocument(validatedData);
      return res.status(201).json(doc);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/policy-documents/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const doc = await storage.updatePolicyDocument(req.params.id, req.body);
      if (!doc) {
        return res.status(404).json({ message: "Policy document not found" });
      }
      return res.json(doc);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/policy-documents/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deletePolicyDocument(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Upload policy document from PDF/Word file
  app.post("/api/policy-documents/upload", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Virus scan the uploaded file
      const user = await storage.getUser(req.session.userId!);
      const scanCheck = await scanAndLogFile(req.file, "policy-document", user?.username);
      if (!scanCheck.allowed) {
        return res.status(400).json({ message: scanCheck.error });
      }

      const { name, category, version } = req.body;
      if (!name || !category) {
        return res.status(400).json({ message: "Name and category are required" });
      }

      const isDocx = req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || req.file.originalname.toLowerCase().endsWith(".docx");
      let content = "";

      if (isDocx) {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        content = result.value;
      } else {
        const extracted = await extractPdfTextWithPdfjs(req.file.buffer);
        content = extracted.text;
      }

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Could not extract text from document" });
      }

      const doc = await storage.createPolicyDocument({
        name,
        category,
        content,
        version: version || "1.0",
        lastUpdated: new Date(),
      });

      return res.status(201).json(doc);
    } catch (error: any) {
      console.error("Policy document upload error:", error);
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== AI AUDIT ROUTES =====

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

      const isDocx = req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || req.file.originalname.toLowerCase().endsWith(".docx");

      let text = "";

      if (isDocx) {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value;
      } else {
        const extracted = await extractPdfTextWithPdfjs(req.file.buffer);
        text = extracted.text;
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
      return res.status(500).json({ message: error.message || "Preflight failed" });
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
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = {
      userId: user?.id != null ? String(user.id) : null,
      username: user?.username != null ? String(user.username) : null,
    };
    const emarPrimaryModel = getAccurateModel();
    const emarMetadataModel = emarPrimaryModel;
    const emarExtractionModel = emarPrimaryModel;
    const emarValidationModel = emarPrimaryModel;
    
    // Set up SSE streaming response headers (after file is validated)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Heartbeat to keep connection alive during long AI processing
    let heartbeatInterval: NodeJS.Timeout | null = null;
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

      // STEP 1: Extract text from PDF (primary method while Vision API unavailable)
      let extracted: Awaited<ReturnType<typeof extractPdfTextWithPdfjs>> | null = null;
      let documentText = "";
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
        console.log(`DEBUG: Final extracted text: ${documentText.length} chars from PDF (pdfjs-dist)`);
      } catch (textError: any) {
        console.error("PDF text extraction failed:", textError);
        sendEvent('error', { message: "Failed to extract text from PDF: " + textError.message });
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
      // USE EMAR AGENT (enabled by default unless explicitly disabled)
      // Toggle: USE_EMAR_AGENT=true/false (false disables)
      // =====================================================================
      const emarAgentFlag = (process.env.USE_EMAR_AGENT || "").toLowerCase();
      const useEmarAgent = emarAgentFlag !== "false" && emarAgentFlag !== "0" && emarAgentFlag !== "off";
      let agentExtractionSucceeded = false;
      let agentExtractedData: any = null;
      let agentDrugInteractions: any[] = [];
      
      if (useEmarAgent) {
        console.log("=== USING EMAR AGENT (GPT-4o-mini) ===");
        sendProgress(15, "Using cost-efficient EMAR agent...", "emar_agent");
        
        try {
          const agentText = documentText;
          const agentResult = await emarAgent.extract(
            agentText,
            tableStructure,
            correctionsContext,
            aiUserContext,
            { gridBaseline }
          );
          
          console.log(`EMAR Agent completed: ${agentResult.entries.length} entries, ${agentResult.consensusStatus}, validation: ${agentResult.validationPassed}`);
          sendProgress(60, `Extracted ${agentResult.entries.length} entries via agent...`, "agent_complete");
          
          // Convert agent result to the format expected by the rest of the code
          const metadata = agentResult.metadata;
          metadata.serviceUserInitials = normalizeInitials(metadata.serviceUserInitials);
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

          const normalizeAgentCode = (raw: unknown): string => {
            if (!raw) return "";
            let code = String(raw)
              .toUpperCase()
              .trim()
              .replace(/[()\[\]{}]/g, "")
              .replace(/[–—]/g, "-")
              .replace(/\s+/g, "");

            if (!code) return "";
            if (code === "F" || code === "FAMILY" || code === "FAM" || code === "F/A") return "FA";
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
          
          // Build medication scheduled slot counts for time gap detection
          const agentMedScheduledSlotsById = new Map<number, number>();
          const agentMedGapHoursById = new Map<number, number>();
          const agentMedScheduledSlotsByName = new Map<string, number>(); // fallback
          const agentMedGapHoursByName = new Map<string, number>(); // fallback
          agentMedications.forEach((m: any) => {
            const slots = m.scheduledTimeSlots?.length || agentTimeSlots.length;
            const gapHours = m.requiredGapHours || 4;
            const medId = Number(m.medicationId) || 0;
            if (m?.name) {
              agentMedScheduledSlotsByName.set(m.name, slots);
              agentMedGapHoursByName.set(m.name, gapHours);
            }
            if (medId) {
              agentMedScheduledSlotsById.set(medId, slots);
              agentMedGapHoursById.set(medId, gapHours);
            }
          });
          
          const agentDiscrepancies: any[] = [];
          const agentWarnings: any[] = [];
          const agentVerificationItems: any[] = [];
          
          // =====================================================================
          // NON-ADMINISTRATION DETECTION (codes requiring reason review)
          // R=Refused, NH=Not Home, SA=Self Administered, F/FA=Family Administered, MU=Medication Unavailable
          // =====================================================================
          const reviewCodes = ['R', 'PRN-R', 'NH', 'SA', 'F', 'FA', 'MU'];
          const mainRefusalDiscrepancies: any[] = [];
          const prnRefusalDiscrepancies: any[] = [];
          
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
              case 'FA':
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
              case 'FA':
                return "Check if family administration is documented and appropriate";
              case 'MU':
                return "Check if medication unavailability is documented and escalated";
              default:
                return "Check if this entry is documented appropriately";
            }
          };
          
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
            }
          });

          // =====================================================================
          // PRN CODE MISUSE + INVALID CODES (match legacy pipeline CHECK 5d/5e)
          // =====================================================================
          const PRN_CODES = ['PRN', 'PRN-AD', 'PRN-AS', 'PRN-R'];
          const INVALID_PRN_CODES = ['AD', 'AS', 'P'];
          const VALID_ADMIN_CODES = ['AD', 'SA', 'NH', 'R', 'FA', 'MU'];

          agentEntries.forEach((entry: any) => {
            const code = normalizeAgentCode(entry.code || "");
            if (!code) return;

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
                  issue: `Invalid code "${code}" used on administered medication - valid codes are: AD, SA, NH, R, FA, MU`,
                  severity: "high",
                  actions: { performanceNote: true, meeting: "phone", referToManager: true }
                });
              }
            }
          });
          
          console.log(`Agent: Found ${mainRefusalDiscrepancies.length} main non-admin codes, ${prnRefusalDiscrepancies.length} PRN non-admin codes`);
          
          // =====================================================================
          // TIME GAP DETECTION (for medications with 2+ slots/day)
          // =====================================================================
          const administrationCodes = ['AD', 'AS', 'P', 'G', 'A', 'PRN', 'PRN-AD', 'PRN-AS'];
          const medDateEntriesForGap = new Map<string, any[]>();
          
          agentEntries.forEach((entry: any) => {
            const code = (entry.code || '').toUpperCase();
            if (!administrationCodes.some(c => code === c || code.startsWith(c))) return;
            
            // Skip office-closed entries from time gap checks (manually closed by office staff)
            if (entry.isOfficeClosed) {
              console.log(`DEBUG: Skipping office-closed entry from time gap check: ${entry.medication} on ${entry.date}`);
              return;
            }
            
            // Extract time from entry
            let timeValue = entry.time;
            if (!timeValue && entry.timeSlot) {
              const timeMatch = entry.timeSlot.match(/(\d{1,2}:\d{2})/);
              if (timeMatch) timeValue = timeMatch[1];
            }
            if (!timeValue) return;
            
            // Normalize date for grouping
            const dateKey = entry.date.toLowerCase().replace(/[,\s]+/g, '-').substring(0, 10);
            const medId = Number(entry.medicationId) || 0;
            const medKey = medId > 0 ? `id:${medId}` : `name:${entry.medication || ""}`;
            const key = `${medKey}|${dateKey}`;
            
            if (!medDateEntriesForGap.has(key)) medDateEntriesForGap.set(key, []);
            medDateEntriesForGap.get(key)!.push({
              ...entry,
              extractedTime: timeValue,
              isPRN:
                (medId > 0 && agentPrnMedIds.has(medId)) ||
                agentPrnMeds.has(entry.medication) ||
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

            const scheduledSlots =
              medId > 0
                ? agentMedScheduledSlotsById.get(medId) || 1
                : agentMedScheduledSlotsByName.get(medication) || 1;
            
            // Skip once-daily medications
            if (scheduledSlots <= 1) return;
            
            const requiredGap =
              medId > 0
                ? agentMedGapHoursById.get(medId) || 4
                : agentMedGapHoursByName.get(medication) || 4;
            
            // Sort by time
            const sorted = dayEntries.sort((a: any, b: any) => {
              const [aH, aM] = a.extractedTime.split(':').map(Number);
              const [bH, bM] = b.extractedTime.split(':').map(Number);
              return (aH * 60 + aM) - (bH * 60 + bM);
            });
            
            for (let i = 1; i < sorted.length; i++) {
              const prev = sorted[i - 1];
              const curr = sorted[i];
              
              const [prevH, prevM] = prev.extractedTime.split(':').map(Number);
              const [currH, currM] = curr.extractedTime.split(':').map(Number);
              const gapHours = ((currH * 60 + currM) - (prevH * 60 + prevM)) / 60;
              
              // Skip near-duplicates or negative gaps
              if (gapHours <= 0.25 || gapHours < 0) continue;
              
              if (gapHours < requiredGap - 0.17) {
                agentDiscrepancies.push({
                  careWorkerName: curr.careWorkerInitials || 'Unknown',
                  date: curr.date,
                  timeSlot: curr.timeSlot,
                  medication: medication,
                  medicationId: medId || undefined,
                  issue: `Time gap violation: Only ${gapHours.toFixed(1)} hours between doses (required: ${requiredGap}h). Previous: ${prev.extractedTime}, Current: ${curr.extractedTime}`,
                  severity: "high",
                  actions: { performanceNote: true, meeting: "in_person", referToManager: true }
                });
              }
            }
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
          const agentPrnCodeCounts = { PRN: 0, FA: 0, MU: 0, NH: 0, R: 0 };
          
          agentEntries.forEach((entry: any) => {
            const code = (entry.code || '').toUpperCase();
            const medId = Number(entry.medicationId) || 0;
            const isPRN = (medId > 0 && agentPrnMedIds.has(medId)) || agentPrnMeds.has(entry.medication);
            
            if (isPRN) {
              if (code === 'PRN' || code === 'PRN-AD' || code === 'PRN-AS') agentPrnCodeCounts.PRN++;
              else if (code === 'FA') agentPrnCodeCounts.FA++;
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
          
          const agentAnalysisResult = {
            serviceUserName: agentExtractedData.serviceUserInitials || 'N.N.',
            serviceUserInitials: agentExtractedData.serviceUserInitials || 'N.N.',
            serviceUserType: agentServiceUserType,
            allergies: agentExtractedData.allergies || 'NKDA',
            medicationLevelEvidence: `Code counts (regular): AD=${agentCodeCounts.AD}, AS=${agentCodeCounts.AS}, P=${agentCodeCounts.P}. PRN: PRN=${agentPrnCodeCounts.PRN}, FA=${agentPrnCodeCounts.FA}, MU=${agentPrnCodeCounts.MU}, NH=${agentPrnCodeCounts.NH}, R=${agentPrnCodeCounts.R}. Service level: ${agentServiceUserType.toUpperCase()}.`,
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
          
          console.log('Agent: Analysis complete -', {
            entries: agentEntries.length,
            discrepancies: agentDiscrepancies.length,
            refusals: mainRefusalDiscrepancies.length + prnRefusalDiscrepancies.length,
            drugInteractions: agentExtractedData.drugInteractions.length
          });
          
          // Send final result
          sendProgress(100, 'Analysis complete!', 'complete');
          sendEvent('result', agentAnalysisResult);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          return res.end();
          
        } catch (agentError: any) {
          console.error("EMAR Agent failed, falling back to standard extraction:", agentError.message);
          sendEvent('warning', { message: "Agent extraction failed, using standard method..." });
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
        if (/\b(AD|AS|P|R|MU|NH|SA|FA|PRN|MISSED)\b/i.test(content)) return count + 1;
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
            const response = await createChatCompletionWithLogging({
              model: emarMetadataModel,
              messages: [
                { role: "system", content: prompt },
                { role: "user", content: JSON.stringify({ medications: batch }) },
              ],
              max_completion_tokens: 1200,
              temperature: 0,
              seed: DETERMINISTIC_SEED,
              response_format: { type: "json_object" },
            }, "emar_medication_normalize", aiUserContext);

            const content = response.choices[0]?.message?.content || "{}";
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
        const metadataResponse = await createChatCompletionWithLogging({
          model: emarMetadataModel,
          messages: [
            { role: "system", content: metadataPrompt },
            { role: "user", content: `Analyze this EMAR document and extract the metadata:\n\n${text}` }
          ],
          max_completion_tokens: 4000,
          temperature: 0,
          seed: DETERMINISTIC_SEED,
          response_format: { type: "json_object" },
        }, "emar_metadata", aiUserContext);
        return metadataResponse.choices[0]?.message?.content || "{}";
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
            const response = await createChatCompletionWithLogging({
              model: emarValidationModel,
              messages: [
                { role: "system", content: medicationListPrompt },
                { role: "user", content: `List medications in this document:\n\n${text}` },
              ],
              temperature: 0,
              max_completion_tokens: 500,
              seed: DETERMINISTIC_SEED,
              response_format: { type: "json_object" },
            }, "emar_count_validation", aiUserContext);

            const content = response.choices[0]?.message?.content || '{"medications":[]}';
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

      const TIME_RANGE_PATTERN = /\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}/g;
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
          .replace(/\bF\s*[-–\/]?\s*A\b/g, "FA")
          .replace(/\bN\s*\/\s*H\b/g, "NH")
          .replace(/\bM\s*\/\s*U\b/g, "MU")
          .replace(/\bA\s*\/\s*D\b/g, "AD")
          .replace(/\bA\s*\/\s*S\b/g, "AS")
          .replace(/\bN\s*H\b/g, "NH")
          .replace(/\bM\s*U\b/g, "MU")
          .replace(/\bA\s*D\b/g, "AD")
          .replace(/\bA\s*S\b/g, "AS")
          .replace(/\bF\b/g, "FA");
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

        if (code === "F" || code === "FAMILY" || code === "FAM" || code === "F/A") return "FA";
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
        return /\b\d{1,2}[:.]\d{2}\b/.test(content);
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
      const aiServiceUserInitials = normalizeInitials(metadata.serviceUserInitials);
      metadata.serviceUserInitials =
        gridServiceUserInitials !== "N.N." ? gridServiceUserInitials : aiServiceUserInitials;

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
        "FA": 88,
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
- SA (self-administered), FA (family administered)
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
- DO NOT confuse medication codes (AS, AD, P, R, MU, NH, SA, FA, PRN) for care worker initials - MEDICATION CODES ARE NEVER INITIALS!`;

          const chunkPromises = legacyTextChunks.map(async (chunkText, chunkIndex) => {
            try {
              const response = await createChatCompletionWithLogging(
                {
                  model: emarExtractionModel,
                  messages: [
                    { role: "system", content: prompt },
                    {
                      role: "user",
                      content: `Extract medication entries from this document chunk (${chunkIndex + 1}/${legacyTextChunks.length}):\n\n${chunkText}`
                    }
                  ],
                  temperature: 0,
                  max_completion_tokens: 8000,
                  seed: DETERMINISTIC_SEED,
                  response_format: { type: "json_object" }
                },
                "emar_extraction",
                aiUserContext
              );

              const content = response.choices[0]?.message?.content || '{"entries":[]}';
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
- SA (self-administered), FA (family administered)
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
- DO NOT confuse medication codes (AS, AD, P, R, MU, NH, SA, FA, PRN) for care worker initials - MEDICATION CODES ARE NEVER INITIALS!`;
          
          try {
            const response = await createChatCompletionWithLogging({
              model: emarExtractionModel,
              messages: [
                { role: "system", content: batchPrompt },
                { role: "user", content: `Extract medication entries from this document:\n\n${analysisText}` }
              ],
        temperature: 0,
        max_completion_tokens: 8000,
              seed: DETERMINISTIC_SEED,
              response_format: { type: "json_object" },
            }, "emar_extraction", aiUserContext);
            
            const content = response.choices[0]?.message?.content || '{"entries":[]}';
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
      const validCodes = new Set(["AD", "AS", "P", "PRN", "PRN-R", "PRN-AD", "PRN-AS", "R", "MU", "NH", "SA", "FA", "MISSED"]);
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
      const refusalCodes = new Set(["R", "MU", "NH", "FA", "SA", "PRN-R", "MISSED"]);
      
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

        if (medId && med.requiredGapHours) medGapHoursById.set(medId, med.requiredGapHours);

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
          // Use GPT-4o-mini for equivalence detection - 33x cheaper
          const equivalenceResponse = await createChatCompletionWithLogging({
            model: emarValidationModel,
            messages: [
              {
                role: "system",
                content: `You are a UK pharmaceutical expert. Analyze this list of medications from an EMAR and identify any pairs that are the SAME medication under different names (brand vs generic, or different brand names for the same drug).

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
              },
              {
                role: "user",
                content: "Identify any medication equivalences from the list provided."
              }
            ],
            temperature: 0,
            max_completion_tokens: 1000,
            seed: DETERMINISTIC_SEED,
            response_format: { type: "json_object" }
          }, "emar_equivalence", aiUserContext);

          const equivalenceContent = equivalenceResponse.choices[0]?.message?.content || "{}";
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
      const prnCodeCounts: { [key: string]: number } = { PRN: 0, "PRN-R": 0, FA: 0, MU: 0, NH: 0, R: 0 }; // Separate counts for PRN medication codes
      
      allEntries.forEach((entry: any) => {
        const code = (entry.code || "").toUpperCase();
        const isPrnMed = prnMedIds.has(entry.medicationId);
        
        if (isPrnMed) {
          // PRN medications use PRN, PRN-R (refused), FA (family administered), MU, NH, R codes
          if (code === "PRN") prnCodeCounts.PRN++;
          if (code === "PRN-R") prnCodeCounts["PRN-R"]++;
          if (code === "FA") prnCodeCounts.FA++;
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
          if (code === "F" || code === "FAMILY" || code === "FAM" || code === "F/A") return "FA";
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

        const IMPORTANT_CODES = new Set(["R", "PRN-R", "MU", "NH", "SA", "FA", "MISSED"]);
        const verificationNotes: Record<string, string> = {
          MU: "Check if medication unavailability is documented and escalated",
          NH: "Check if not home status is documented",
          SA: "Check if self-administration was appropriate and witnessed",
          FA: "Check if family administration is documented and appropriate",
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
            const careWorkerName = cell.careWorker || "Unknown";
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

          const careWorkerName = cell.careWorker || "Unknown";
          const medicationName = medMatch.name || cell.medication;

          const isRefusal = code === "R" || code === "PRN-R";
          const isMissed = code === "MISSED";
          const needsVerification = code === "MU" || code === "NH" || code === "SA" || code === "FA";

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
            careWorkerName: careWorker || "Unknown",
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

        if (code === "FA") {
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            medicationId: entryMedId || undefined,
            code: "FA",
            note: "Check if family administration is documented and appropriate"
          });
        }

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
        // AD (Administered), SA (Self Administered), NH (Not Home), R (Refused), 
        // FA (Family Administered), MU (Medication Unavailable)
        // Any other codes like AS (Assisted) or P (Prompted) are discrepancies
        
        const VALID_ADMIN_CODES = ['AD', 'SA', 'NH', 'R', 'FA', 'MU'];
        
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
              issue: `Invalid code "${code}" used on administered medication - valid codes are: AD, SA, NH, R, FA, MU`,
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
      // Excluded codes: BLANK, EMPTY, MU, NH, R, FA, MISSED, SA (self-admin)
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
        if (["BLANK", "EMPTY", "", "MU", "NH", "R", "FA", "MISSED", "SA"].includes(code)) return;
        
        // Only include entries where medication was actually administered
        if (!isAdministeredCode(code)) return;
        
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
        
        const medId = Number(entry.medicationId) || 0;
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
        
        // SKIP: Once-daily medications should not trigger time gap checks
        // If a medication has only 1 scheduled time slot, it's once-daily and 
        // any multiple entries are likely duplicate extractions from different time slot rows
        const scheduledSlots = medId > 0 ? medScheduledSlotCountById.get(medId) || 1 : 1;
        if (scheduledSlots <= 1) {
          console.log(`DEBUG: Skipping time gap check for once-daily medication "${medication}" (${scheduledSlots} scheduled slot)`);
          return;
        }
        
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
            discrepancies.push({
              careWorkerName: curr.careWorker,
              date: curr.date,
              timeSlot: curr.timeSlot,
              medication: medication,
              medicationId: medId || undefined,
              issue: `${issueType} time gap violation: Only ${gapHours.toFixed(1)} hours between doses (required: ${requiredGap} hours minimum). Previous dose at ${prev.extractedTime}, this dose at ${curr.extractedTime}`,
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
          // Use GPT-4o-mini for validation passes - cheaper than GPT-4.1-mini
          const pass2Response = await createChatCompletionWithLogging({
            model: emarValidationModel,
            messages: [
              { role: "system", content: pass2SystemPrompt },
              { role: "user", content: hasTextContext 
                ? "Review the discrepancies. Be conservative - when in doubt, keep the discrepancy."
                : [...imageContent, { type: "text", text: "Review the discrepancies based on these EMAR images. Be conservative - when in doubt, keep the discrepancy." }]
              }
            ],
            temperature: 0,
            max_completion_tokens: 2000,
            seed: DETERMINISTIC_SEED,
            response_format: { type: "json_object" },
          }, "emar_validation_pass2", aiUserContext);
          
          const pass2Content = pass2Response.choices[0]?.message?.content || "{}";
          
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
            // Use GPT-4o-mini for validation passes - cheaper than GPT-4.1-mini
            const pass3Response = await createChatCompletionWithLogging({
              model: emarValidationModel,
              messages: [
                { role: "system", content: pass3SystemPrompt },
                { role: "user", content: hasTextContext
                  ? "Confirm discrepancies and provide evidence where possible. Keep discrepancies even without explicit text evidence."
                  : [...imageContent, { type: "text", text: "Confirm discrepancies based on these EMAR images. Provide evidence where visible. Keep discrepancies even without clear visual evidence." }]
                }
              ],
              max_completion_tokens: 2000,
              temperature: 0,
              seed: DETERMINISTIC_SEED,
              response_format: { type: "json_object" },
            }, "emar_validation_pass3", aiUserContext);
            
            const pass3Content = pass3Response.choices[0]?.message?.content || "{}";
            
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

      const redCodeSet = new Set(["R", "MU", "NH", "FA", "SA", "PRN-R", "MISSED"]);
      const redIssuePattern = /\b(refus|not home|self-admin|self administered|family|unavailable|missed)\b/i;
      const normalizeRedCode = (raw: unknown): string => {
        const input = String(raw || "").toUpperCase().trim();
        if (!input) return "";
        if (input === "F" || input === "F/A") return "FA";
        if (input === "S/A" || input === "S-A") return "SA";
        if (input === "PRNR") return "PRN-R";
        return input;
      };
      const inferRedCodeFromIssue = (issue: string): string => {
        if (/not home/i.test(issue)) return "NH";
        if (/self-admin/i.test(issue)) return "SA";
        if (/family/i.test(issue)) return "FA";
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
              careWorkerName: discrepancy.careWorkerName || "Unknown",
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
      // Main Refusals: R, MU, NH, FA, SA codes (non-PRN refusal-related codes)
      // PRN Refusals: PRN-R codes only
      // Other discrepancies: everything else
      // =====================================================================
      const normalizeRefusalCode = (raw: unknown): string => {
        const input = String(raw || "").toUpperCase().trim();
        if (!input) return "";
        if (input === "F" || input === "F/A") return "FA";
        if (input === "S/A" || input === "S-A") return "SA";
        if (input === "PRNR") return "PRN-R";
        return input;
      };

      const REFUSAL_CODES = new Set(["R", "MU", "NH", "FA", "SA", "PRN-R", "MISSED"]);
      const refusalEntries: any[] = [];

      allEntries.forEach((entry: any) => {
        const normalizedCode = normalizeRefusalCode(entry.code);
        if (!REFUSAL_CODES.has(normalizedCode)) return;
        refusalEntries.push({
          careWorkerName: entry.careWorker || "Unknown",
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
        medicationLevelEvidence: `Code counts (regular meds): AD=${codeCounts.AD}, AS=${codeCounts.AS}, P=${codeCounts.P}. PRN meds: PRN=${prnCodeCounts.PRN}, FA=${prnCodeCounts.FA}, MU=${prnCodeCounts.MU}, NH=${prnCodeCounts.NH}, R=${prnCodeCounts.R}. Service level: ${serviceUserType.toUpperCase()}.`,
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

      console.log("DEBUG: Count validation summary -", {
        medicationCountConsensus,
        agreedMedicationCount,
        extractedMedicationCount,
        agreedCount,
        extractedCount,
        countValidationMatch
      });

      // Send final result and 100% progress
      sendProgress(100, "Analysis complete!", "complete");
      sendEvent('result', result);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
      
      } // End of if (!agentExtractionSucceeded) block
      
    } catch (error: any) {
      console.error("EMAR AI Error:", error);
      sendEvent('error', { message: error.message || "AI analysis failed" });
      if (heartbeatInterval) clearInterval(heartbeatInterval);
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
      const parsed = (XLSX as any).SSF?.parse_date_code?.(value);
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
      workbook = XLSX.read(raw, { type: "string", cellDates: true });
    } catch {
      const truncated = raw.slice(0, VISIT_MAX_TOKENS * VISIT_CHARS_PER_TOKEN);
      return { text: truncated, method: "raw-truncate", truncated: true };
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

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
      const serviceUser = row.SU || "Unknown";
      const careWorker = row.CWa || "Unknown";
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

  // Analyze Visit Notes with SSE streaming progress
  app.post("/api/ai/analyze-visit", requireAuth, async (req, res) => {
    const { documentContent } = req.body;
    
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Heartbeat to keep connection alive
    let heartbeatInterval: NodeJS.Timeout | null = null;
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
        const localResult = buildDeterministicVisitAudit(preprocessing.lines);
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

VALIDATION RULES:
1. LOCATION: Carer must log in at location (less than 200m from service user's address) for the call to be compliant.
2. DURATION: Care call is compliant if carer stayed for ≥70% of expected time.
3. JUSTIFICATIONS: Visit can still be compliant if notes explain valid reason (service user in hospital, service user requested early departure, etc.)
4. CONCERNS: Check if notes mention any concerns and whether appropriate action was taken.
5. NOTE QUALITY: Assess if notes are of acceptable professional standard.

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

      const chunkResults: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const label = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
        sendProgress(30, `Running AI analysis${label}...`, "ai_analysis");

        const response = await createChatCompletionWithLogging({
          model: visitAuditModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analyze these visit logs:\n\n${chunks[i]}` }
          ],
          max_completion_tokens: 4000,
          temperature: 0,
          seed: DETERMINISTIC_SEED,
          response_format: { type: "json_object" },
        }, "visit_audit", aiUserContext);

        const content = response.choices[0]?.message?.content || "";
        const parsed = parseVisitAuditResult(content);
        if (parsed) {
          chunkResults.push(parsed);
        } else {
          const hasBrace = content.includes("{");
          console.warn(`[Visit Audit] Chunk ${i + 1} returned unparsable JSON output (length=${content.length}, hasBrace=${hasBrace}).`);
        }
      }

      if (chunkResults.length === 0) {
        throw new Error("No result received from analysis");
      }

      const result = chunkResults.length === 1
        ? chunkResults[0]
        : mergeVisitAuditResults(chunkResults);

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
          
          // Use more document context
          const docContext = analysisContent.substring(0, 30000);
          
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
            const pass2Response = await createChatCompletionWithLogging({
              model: visitAuditValidationModel,
              messages: [
                { role: "system", content: pass2Prompt },
                { role: "user", content: "Review discrepancies. Be conservative - when in doubt, keep." }
              ],
              max_completion_tokens: 2000,
              temperature: 0,
              seed: DETERMINISTIC_SEED,
              response_format: { type: "json_object" },
            }, "visit_audit_validation_pass2", aiUserContext);
            
            const pass2Content = pass2Response.choices[0]?.message?.content || "";
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
              const pass3Response = await createChatCompletionWithLogging({
                model: visitAuditValidationModel,
                messages: [
                  { role: "system", content: pass3Prompt },
                  { role: "user", content: "Confirm and provide evidence. Keep discrepancies even without explicit text." }
                ],
                max_completion_tokens: 2000,
                temperature: 0,
                seed: DETERMINISTIC_SEED,
                response_format: { type: "json_object" },
              }, "visit_audit_validation_pass3", aiUserContext);
              
              const pass3Content = pass3Response.choices[0]?.message?.content || "";
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
        
        result.discrepancies = validatedDiscrepancies;
        result.hasDiscrepancies = validatedDiscrepancies.length > 0;
        result.validationPasses = 3;
        result.validationStatus = validationStatus;
        result.validationEvidence = validationEvidence;
        result.initialDiscrepancyCount = originalCount;
        
        sendProgress(100, "Analysis complete!", "complete");
        sendEvent('result', result);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
    } catch (error: any) {
      console.error("Visit AI Error:", error);
      sendEvent('error', { message: error.message || "AI analysis failed" });
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
    }
  });

  // Analyze documents for risk assessment
  app.post("/api/ai/analyze-risks", requireAuth, async (req: any, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    try {
      const { documentContent, allowSensitive } = req.body;
      const allowSensitiveView = Boolean(allowSensitive) && req.user?.role === "admin";
      
      if (!documentContent) {
        return res.status(400).json({ message: "Document content required" });
      }

      // Set up SSE for progress streaming with production-safe settings
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');
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
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      const sendProgress = (percent: number, status: string, stage: string) => {
        console.log(`[Risks SSE] Progress: ${percent}% - ${status}`);
        sendEvent('progress', { percent, status, stage });
      };

      sendProgress(5, "Initializing...", "init");
      await new Promise(resolve => setTimeout(resolve, 50));
      sendProgress(8, "Loading policy documents...", "loading_policies");

      // Fetch ALL policy documents for comprehensive risk assessment
      const initialAssessmentPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      const riskAssessmentPolicies = await storage.getPolicyDocumentsByCategory("risk_assessment");
      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");
      
      // Build policy context from uploaded documents
      let policyContext = "";
      const allPolicies = [...initialAssessmentPolicies, ...riskAssessmentPolicies, ...carePlanPolicies, ...scopeOfPracticePolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY DOCUMENTS - YOU MUST FOLLOW THESE AS REFERENCE ===
${initialAssessmentPolicies.map(p => `
--- INITIAL ASSESSMENT TEMPLATE: ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
${riskAssessmentPolicies.map(p => `
--- RISK ASSESSMENT TEMPLATE: ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
${carePlanPolicies.map(p => `
--- CARE PLAN TEMPLATE: ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
${scopeOfPracticePolicies.map(p => `
--- SCOPE OF PRACTICE: ${p.name} (${p.version || 'v1.0'}) ---
${p.content}
`).join('\n')}
=== END POLICY DOCUMENTS ===

CRITICAL: You MUST structure your response using the templates above as reference. Cover EVERY point from the initial assessment template. Do not skip any sections.

`;
      }

      const privacyRules = allowSensitiveView
        ? `5. Full names may be included only if they appear in the documents. Do not invent names.
6. Keep place names and locations as written. Do not redact places.
7. Never include dates of birth.`
        : `5. Do NOT include any person names. Use role terms (my carer, my GP, my family member)
6. Keep place names and locations as written. Do not redact places.`;

      const systemPrompt = `You are an expert care assessor for a UK care facility. Analyze the uploaded documents to identify service user information and determine which risk assessments are needed.
${policyContext}
FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (—) or en-dashes (–). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

IMPORTANT RULES:
1. ONLY use information explicitly stated in the documents. Never make assumptions.
2. If you cannot find specific information, state "Information not found in documents"
3. Be very careful to extract the correct service user details
4. Write narrative fields in FIRST PERSON using "I" and "my"
${privacyRules}

EXTRACT FROM DOCUMENTS:
- Service user initials ONLY (format: "F.O." - first letter of first name + "." + first letter of last name + ".")
- Medical conditions mentioned (diabetes, epilepsy, strokes, dementia, etc.)
- Care activities we assist with (feeding, medication, mobility, personal care, etc.)
- Any concerns mentioned (falls history, skin issues, behavioral concerns, etc.)

PRIVACY REQUIREMENT:
- NEVER include dates of birth
- Extract initials in format "F.O." (first initial + dot + last initial + dot)
- Example: "Freda O'Neill" becomes "F.O."

MANDATORY RISK ASSESSMENTS (if applicable):
- "Nutrition" - if we assist with feeding or food preparation
- "Diabetes Management" - if service user is diabetic
- "Epilepsy Management" - if service user has epilepsy
- "Medication Administration" - if we assist with medications
- "Mobility & Moving and Handling" - if we assist with mobility or transfers
- "Personal Care" - if we assist with personal care
- "Skin Integrity" - if there are concerns about skin or pressure areas
- "Falls Prevention" - if poor mobility or history of falls
- "Continence Care" - if we assist with continence
- "Dementia Care" - if service user has dementia or cognitive impairment
- "Mental Health" - if mental health conditions mentioned
- "Communication" - if communication difficulties
- "Behavior Support" - if challenging behaviors mentioned
- "End of Life Care" - if palliative or end of life care mentioned
- "Infection Control" - if infection risks mentioned
- "Fire Safety" - if fire safety concerns
- "Environmental Safety" - if environmental hazards mentioned
- "Lone Working" - if carer works alone
- "Safeguarding" - if safeguarding concerns
- "COSHH" - if handling hazardous substances

Respond ONLY with valid JSON in this exact format:
{
  "serviceUser": {
    "initials": "Initials in format F.O. (first initial + dot + last initial + dot) or 'N.N.' if not found"
  },
  "medicalConditions": ["List of conditions found in documents"],
  "careActivities": ["List of care activities we provide"],
  "concerns": ["List of concerns or risks identified"],
  "recommendedAssessments": [
    {
      "name": "Assessment category name",
      "isMandatory": true/false,
      "reason": "Why this is recommended based on document content"
    }
  ],
  "documentSummary": "Brief summary of what was found in the documents"
}`;

      sendProgress(20, "Analyzing documents with AI...", "ai_analysis");

      // Simulated progress during AI call
      let simulatedProgress = 20;
      progressInterval = setInterval(() => {
        if (simulatedProgress < 75) {
          simulatedProgress += 5;
          const messages = [
            "Analyzing document content...",
            "Identifying care needs...",
            "Evaluating risk factors...",
            "Reviewing medical conditions...",
            "Checking assessment requirements...",
            "Processing recommendations...",
          ];
          const msgIndex = Math.floor((simulatedProgress - 20) / 10) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "ai_analysis");
        }
      }, 3000);

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these documents for risk assessment needs:\n\n${allowSensitiveView ? documentContent : sanitizeNarrativePII(documentContent)}` }
        ],
        max_completion_tokens: 4000,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "risk_analysis", aiUserContext);

      clearInterval(progressInterval);
      sendProgress(80, "Processing results...", "processing");

      const content = response.choices[0]?.message?.content || "";
      const parsed = parseJsonFromContent(content);
      if (!parsed) {
        sendEvent('error', { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }

      const result = {
        serviceUser: { initials: normalizeInitials(parsed?.serviceUser?.initials) },
        medicalConditions: Array.isArray(parsed?.medicalConditions) ? parsed.medicalConditions : [],
        careActivities: Array.isArray(parsed?.careActivities) ? parsed.careActivities : [],
        concerns: Array.isArray(parsed?.concerns) ? parsed.concerns : [],
        recommendedAssessments: Array.isArray(parsed?.recommendedAssessments) ? parsed.recommendedAssessments : [],
        documentSummary: typeof parsed?.documentSummary === "string" ? parsed.documentSummary : "Information not found in documents",
      };

      result.documentSummary = toFirstPerson(result.documentSummary);
      result.recommendedAssessments = result.recommendedAssessments.map((assessment: any) => ({
        ...assessment,
        reason: typeof assessment?.reason === "string" ? toFirstPerson(assessment.reason) : assessment?.reason
      }));

      const derivedRecommendations = buildAssessmentRecommendations(result);
      result.recommendedAssessments = mergeAssessmentRecommendations(result.recommendedAssessments, derivedRecommendations);
      result.recommendedAssessments = attachAssessmentEvidence(result.recommendedAssessments, result);

      const scrubbedResult = sanitizeNarrativePII(result);
      const payload = allowSensitiveView ? { ...result, scrubbedResult } : scrubbedResult;
      sendProgress(100, "Complete!", "complete");
      sendEvent('result', payload);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
    } catch (error: any) {
      console.error("Risk Analysis AI Error:", error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (progressInterval) clearInterval(progressInterval);
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "AI analysis failed" })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ message: error.message || "AI analysis failed" });
    }
  });

  // Generate detailed risk assessment content
  app.post("/api/ai/generate-risk-assessment", requireAuth, async (req: any, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    try {
      const { documentContent, assessmentCategory, serviceUserInitials, performedBy, performedByJobTitle, allowSensitive } = req.body;
      const allowSensitiveView = Boolean(allowSensitive) && req.user?.role === "admin";
      
      if (!documentContent || !assessmentCategory) {
        return res.status(400).json({ message: "Document content and assessment category required" });
      }

      // Set up SSE for progress streaming with production-safe settings
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');
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
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      const sendProgress = (percent: number, status: string, stage: string) => {
        console.log(`[RiskGen SSE] Progress: ${percent}% - ${status}`);
        sendEvent('progress', { percent, status, stage });
      };

      sendProgress(10, "Analyzing documents...", "analyzing");

      const riskAssessmentPolicies = await storage.getPolicyDocumentsByCategory("risk_assessment");
      const initialAssessmentPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");

      let policyContext = "";
      const allPolicies = [...riskAssessmentPolicies, ...initialAssessmentPolicies, ...scopeOfPracticePolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY DOCUMENTS - FOLLOW THESE AS REFERENCE ===
${riskAssessmentPolicies.map(p => `--- RISK ASSESSMENT TEMPLATE: ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}
${initialAssessmentPolicies.map(p => `--- INITIAL ASSESSMENT TEMPLATE: ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}
${scopeOfPracticePolicies.map(p => `--- SCOPE OF PRACTICE: ${p.name} (${p.version || 'v1.0'}) ---\n${p.content}`).join('\n')}
=== END POLICY DOCUMENTS ===
`;
      }

      const privacyDirective = allowSensitiveView
        ? "Privacy requirement: You may include full names only if present in the documents. Do not invent names. Never include dates of birth."
        : "Privacy requirement: Never include full names or dates of birth. Use only initials.";

      const systemPrompt = `You are an expert care risk assessor for a UK care facility. Generate a detailed risk assessment for the specified category.
${policyContext}

FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (—) or en-dashes (–). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

IMPORTANT RULES:
1. ONLY use information explicitly stated in the documents provided
2. If something isn't in the documents, say "I'm not aware of this information based on the documents provided"
3. Use professional but clear language suitable for care documentation
4. Follow CQC (Care Quality Commission) standards
5. Write narrative fields in FIRST PERSON using "I" and "my"
6. Do NOT include any person names. Use role terms (my carer, my GP, my family member)
7. Keep place names and locations as written. Do not redact places.

SERVICE USER DETAILS:
- Service User Initials: ${serviceUserInitials || 'N.N.'}

${privacyDirective}

RISK ASSESSMENT CATEGORY: ${assessmentCategory}

For each risk identified in this category, provide:
- Risk definition (what is the risk)
- Initial risk rating (Low/Medium/High)
- How it's a risk (explanation)
- Who will be harmed
- Control measures (what we do to mitigate)
- Risk rating after controls (Low/Medium/High)

Respond ONLY with valid JSON in this exact format:
{
  "category": "${assessmentCategory}",
  "serviceUserInitials": "${serviceUserInitials || 'N.N.'}",
  "assessmentDate": "Today's date in DD/MM/YYYY format",
  "risks": [
    {
      "riskDefinition": "What is the specific risk",
      "initialRating": "Low/Medium/High",
      "howItsARisk": "Explanation of how this poses a risk",
      "whoWillBeHarmed": "Service user/Carer/Both/Visitors",
      "controlMeasures": "Detailed control measures",
      "ratingAfterControls": "Low/Medium/High"
    }
  ],
  "signedBy": "${performedBy || 'Staff member'}",
  "jobTitle": "${performedByJobTitle || 'Care Staff'}",
  "additionalNotes": "Any additional notes or observations from the documents, or 'I'm not aware of additional information based on the documents provided'"
}`;

      sendProgress(30, "Generating risk assessment...", "ai_generation");

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a ${assessmentCategory} risk assessment based on these documents:\n\n${allowSensitiveView ? documentContent : sanitizeNarrativePII(documentContent)}` }
        ],
        temperature: 0,
        seed: 42,
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
      }, "risk_assessment", aiUserContext);

      sendProgress(70, "Processing results...", "processing");

      const content = response.choices[0]?.message?.content || "";
      const parsed = parseJsonFromContent(content);
      if (parsed) {
        let result = parsed;
        
        // Preserve fields that should NOT be scrubbed (they contain expected values)
        const preservedFields = {
          assessmentDate: result.assessmentDate || new Date().toLocaleDateString("en-GB"),
          signedBy: result.signedBy || performedBy || 'Staff member',
          jobTitle: result.jobTitle || performedByJobTitle || 'Care Staff',
          category: result.category,
        };
        
        // Apply PII scrubbing to the rest (risks, notes, etc.)
        result.serviceUserInitials = normalizeInitials(result.serviceUserInitials);

        if (!Array.isArray(result.risks) || result.risks.length === 0) {
          result.risks = [
            {
              riskDefinition: "Information not found in documents",
              initialRating: "Low",
              howItsARisk: "Relevant detail was not found in the provided documents.",
              whoWillBeHarmed: "Service user",
              controlMeasures: "Confirm details with the service user or commissioning team.",
              ratingAfterControls: "Low",
            },
          ];
        }
        
        // Restore preserved fields (override any scrubbed values)
        result.assessmentDate = preservedFields.assessmentDate;
        result.signedBy = performedByJobTitle || preservedFields.jobTitle || "Care Staff";
        result.jobTitle = preservedFields.jobTitle;
        result.category = preservedFields.category;

        if (Array.isArray(result.risks)) {
          result.risks = result.risks.map((risk: any) => ({
            ...risk,
            riskDefinition: typeof risk?.riskDefinition === "string" ? toFirstPerson(risk.riskDefinition) : risk?.riskDefinition,
            howItsARisk: typeof risk?.howItsARisk === "string" ? toFirstPerson(risk.howItsARisk) : risk?.howItsARisk,
            controlMeasures: typeof risk?.controlMeasures === "string" ? toFirstPerson(risk.controlMeasures) : risk?.controlMeasures
          }));
        }
        if (typeof result.additionalNotes === "string") {
          result.additionalNotes = toFirstPerson(result.additionalNotes);
        }
        const scrubbedResult = sanitizeNarrativePII(result);
        const payload = allowSensitiveView ? { ...result, scrubbedResult } : scrubbedResult;
        
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', payload);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        sendEvent('error', { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error: any) {
      console.error("Risk Assessment Generation Error:", error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "AI generation failed" })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ message: error.message || "AI generation failed" });
    }
  });

  // Generate detailed first-person care plan from uploaded documents - CHUNKED APPROACH
  // Generates each section individually for faster feedback and better reliability
  app.post("/api/ai/generate-care-plan", requireAuth, async (req: any, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    try {
      const { documentContent, serviceUserInitials, allowSensitive } = req.body;
      const allowSensitiveView = Boolean(allowSensitive) && req.user?.role === "admin";
      
      if (!documentContent) {
        return res.status(400).json({ message: "Document content required" });
      }

      // Set up SSE for progress streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');
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
        ? "- Full names may be included only if present in the documents. Do not invent names."
        : "- Do NOT include any person names. Use role terms (my carer, my GP, my family member).";

      const baseSystemPrompt = `You are an expert care plan writer for a UK care facility following CQC standards.
${policyContext}
RULES:
- Write EVERYTHING in FIRST PERSON from the service user's perspective using "I", "my", "me".
- CORRECT: "I need two carers to help me transfer." WRONG: "The client needs..."
- Never use m-dashes or en-dashes. Use hyphens or commas.
- Never use Oxford commas.
- Be detailed and specific with times, preferences, routines.
- Only include information found in the documents. If no info, say "Please ask me about my preferences."
${privacyRules}
- Keep place names and locations as written. Do not redact places.

OUTPUT: Return ONLY valid JSON matching this structure:
{
  "title": "Section title",
  "priority": "high/medium/low",
  "content": "Detailed first-person content (minimum 150 words)",
  "steps": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
  "risks": ["Risk if applicable"],
  "equipment": ["Equipment if applicable"]
}`;

      sendProgress(10, "Starting section generation...", "generating");

      const toStringSafe = (value: unknown) =>
        typeof value === "string" ? value : value == null ? "" : String(value);
      const scrubText = (value: unknown) => sanitizeNarrativePII(toStringSafe(value));
      const viewText = (value: unknown) => allowSensitiveView ? toStringSafe(value) : scrubText(value);

      const completedSections: any[] = [];
      const scrubbedSections: any[] = [];
      let emergencyContactsView = "Not found in documents";
      let gpDetailsView = "Not found in documents";
      let additionalNotesView = "No additional notes";
      let emergencyContactsScrubbed = "Not found in documents";
      let gpDetailsScrubbed = "Not found in documents";
      let additionalNotesScrubbed = "No additional notes";
      const documentContentForAi = allowSensitiveView ? documentContent : sanitizeNarrativePII(documentContent);

      // Generate each section individually
      for (let i = 0; i < mandatorySections.length; i++) {
        const section = mandatorySections[i];
        const progressPercent = 10 + Math.round((i / mandatorySections.length) * 80);
        
        sendProgress(progressPercent, `Generating: ${section.title}...`, "generating");
        console.log(`[CarePlan] Generating section ${i + 1}/${mandatorySections.length}: ${section.title}`);

        try {
          const sectionResponse = await createChatCompletionWithLogging({
            model: getAccurateModel(),
            messages: [
              { role: "system", content: baseSystemPrompt },
              { role: "user", content: `Generate the "${section.title}" section (priority: ${section.priority}).

FOCUS ON: ${section.focus}

Service user documents:
${documentContentForAi}

Remember: Write as if I am the service user speaking about my own needs. Return ONLY valid JSON.` }
            ],
            temperature: 0.2,
            max_completion_tokens: 1500,
            seed: 42,
            response_format: { type: "json_object" },
          }, "care_plan_section", aiUserContext);

          const sectionContent = sectionResponse.choices[0]?.message?.content || "";
          const parsed = parseJsonFromContent(sectionContent);
          
          if (parsed) {
            let enhancedContent = parsed.content || "";
            
            // Ensure first-person perspective
            if (!enhancedContent.includes("I ") && !enhancedContent.includes("my ")) {
              enhancedContent = enhancedContent.replace(/The (client|service user|patient)/gi, "I");
              enhancedContent = enhancedContent.replace(/Staff should/gi, "I need my carers to");
            }
            
            const stepsRaw = (Array.isArray(parsed.steps) && parsed.steps.length > 0
              ? parsed.steps
              : ["Please refer to my preferences above", "Check my care notes", "Ask me if unsure"]);
            const risksRaw = Array.isArray(parsed.risks) ? parsed.risks : [];
            const equipmentRaw = Array.isArray(parsed.equipment) ? parsed.equipment : [];

            const completedSection = {
              title: section.title,
              priority: section.priority,
              content: viewText(enhancedContent),
              steps: stepsRaw.map((s: any) => viewText(s)),
              risks: risksRaw.map((r: any) => viewText(r)),
              equipment: equipmentRaw.map((e: any) => viewText(e)),
            };

            const scrubbedSection = {
              title: section.title,
              priority: section.priority,
              content: scrubText(enhancedContent),
              steps: stepsRaw.map((s: any) => scrubText(s)),
              risks: risksRaw.map((r: any) => scrubText(r)),
              equipment: equipmentRaw.map((e: any) => scrubText(e)),
            };

            completedSections.push(completedSection);
            scrubbedSections.push(scrubbedSection);
            
            // Send this section immediately to the frontend
            sendEvent('section', allowSensitiveView
              ? { index: i, section: completedSection, scrubbedSection }
              : { index: i, section: completedSection }
            );
            
          } else {
            // Section generation failed - use placeholder
            const fallbackSection = {
              title: section.title,
              priority: section.priority,
              content: "Based on my documents, I do not have specific requirements in this area. Please ask me about my preferences.",
              steps: ["Ask me about my preferences for this area"],
              risks: [],
              equipment: [],
            };
            completedSections.push(fallbackSection);
            scrubbedSections.push(fallbackSection);
            sendEvent('section', allowSensitiveView
              ? { index: i, section: fallbackSection, scrubbedSection: fallbackSection }
              : { index: i, section: fallbackSection }
            );
          }
        } catch (sectionError: any) {
          console.error(`[CarePlan] Error generating section "${section.title}":`, sectionError.message);
          // Continue with fallback section
          const fallbackSection = {
            title: section.title,
            priority: section.priority,
            content: "Unable to generate this section. Please add information manually.",
            steps: ["Add information for this section manually"],
            risks: [],
            equipment: [],
          };
          completedSections.push(fallbackSection);
          scrubbedSections.push(fallbackSection);
          sendEvent('section', allowSensitiveView
            ? { index: i, section: fallbackSection, scrubbedSection: fallbackSection }
            : { index: i, section: fallbackSection }
          );
        }
      }

      // Extract emergency contacts and GP details from first successful section response
      try {
        const metaResponse = await createChatCompletionWithLogging({
          model: getAccurateModel(),
          messages: [
            { role: "system", content: "Extract contact information from the documents. Return JSON only." },
            { role: "user", content: `From these documents, extract:
1. Emergency contacts (names, relationships, phone numbers)
2. GP details (name, surgery, phone)
3. Any additional important notes

Documents:
${documentContentForAi.substring(0, 3000)}

Return JSON: {"emergencyContacts": "...", "gpDetails": "...", "additionalNotes": "..."}` }
          ],
          temperature: 0,
          max_completion_tokens: 500,
          seed: 42,
          response_format: { type: "json_object" },
        }, "care_plan_meta", aiUserContext);
        
        const metaContent = metaResponse.choices[0]?.message?.content || "";
        const meta = parseJsonFromContent(metaContent);
        if (meta) {
          // Ensure all fields are strings, not objects
          const extractedEmergency = meta.emergencyContacts || emergencyContactsView;
          const extractedGp = meta.gpDetails || gpDetailsView;
          const extractedNotes = meta.additionalNotes || additionalNotesView;
          
          // Convert objects to strings if needed
          const emergencyStr = typeof extractedEmergency === 'string' ? extractedEmergency : 
                               extractedEmergency ? JSON.stringify(extractedEmergency) : emergencyContactsView;
          const gpStr = typeof extractedGp === 'string' ? extractedGp : 
                        extractedGp ? JSON.stringify(extractedGp) : gpDetailsView;
          const notesStr = typeof extractedNotes === 'string' ? extractedNotes : 
                           extractedNotes ? JSON.stringify(extractedNotes) : additionalNotesView;
          
          emergencyContactsView = viewText(emergencyStr);
          gpDetailsView = viewText(gpStr);
          additionalNotesView = viewText(notesStr);
          emergencyContactsScrubbed = scrubText(emergencyStr);
          gpDetailsScrubbed = scrubText(gpStr);
          additionalNotesScrubbed = scrubText(notesStr);
        }
      } catch (e) {
        console.log("[CarePlan] Could not extract meta info, using defaults");
      }

      // Build final result - ensure all fields are correct types
      const result = {
        serviceUserInitials: normalizeInitials(serviceUserInitials || 'N.N.'),
        generatedDate: today,
        sections: Array.isArray(completedSections) ? completedSections.filter((s): s is any => s != null && typeof s === 'object') : [],
        emergencyContacts: String(emergencyContactsView || ""),
        gpDetails: String(gpDetailsView || ""),
        additionalNotes: String(additionalNotesView || ""),
      };
      const scrubbedResult = {
        serviceUserInitials: normalizeInitials(serviceUserInitials || 'N.N.'),
        generatedDate: today,
        sections: Array.isArray(scrubbedSections) ? scrubbedSections.filter((s): s is any => s != null && typeof s === 'object') : [],
        emergencyContacts: String(emergencyContactsScrubbed || ""),
        gpDetails: String(gpDetailsScrubbed || ""),
        additionalNotes: String(additionalNotesScrubbed || ""),
      };

      sendProgress(100, "Complete!", "complete");
      sendEvent('result', allowSensitiveView ? { ...result, scrubbedResult } : scrubbedResult);
      
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
      
    } catch (error: any) {
      console.error("Care Plan Generation Error:", error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "AI generation failed" })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ message: error.message || "AI generation failed" });
    }
  });

  // Enhance existing care plan - generates complete care plan template matching exact form structure
  app.post("/api/ai/enhance-plan", requireAuth, async (req: any, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    try {
      const { documentContent, existingPlanContent, allowSensitive } = req.body;
      const allowSensitiveView = Boolean(allowSensitive) && req.user?.role === "admin";
      
      if (!documentContent && !existingPlanContent) {
        return res.status(400).json({ message: "Document content or existing plan required" });
      }

      // Set up SSE for progress streaming with production-safe settings
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');
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

      const rawContent = existingPlanContent || documentContent;
      const contentToEnhance = typeof rawContent === 'string'
        ? (allowSensitiveView ? rawContent : sanitizeNarrativePII(rawContent))
        : rawContent;

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

      const privacyDirective = allowSensitiveView
        ? "Privacy rules: Full names may be included only if present in the documents. Do not invent names. Never include dates of birth."
        : "Privacy rules: Replace any service user names with I. NEVER include dates of birth. Do NOT include any person names. Use role terms (my carer, my GP, my family member).";

      const systemPrompt = `You are an expert care plan writer for a UK care facility following CQC standards.
${policyContext}
Analyze the uploaded documents and generate content for a COMPLETE Initial Assessment/Care Plan template.

${privacyDirective}
Keep place names and locations as written. Do not redact places.

FORMATTING RULES:
- Never use m-dashes or en-dashes. Use hyphens (-) or commas instead.
- Never use Oxford commas. Write "apples, oranges and bananas" not "apples, oranges, and bananas".
- ALL content must be in FIRST PERSON ("I", "my", "me")
- Be extremely detailed - minimum 100-150 words per main narrative section

Generate content for EVERY section. Extract relevant information from documents and expand with rich detail.

OUTPUT FORMAT - Return ONLY valid JSON matching this EXACT structure:
{
  "thisIsMe": {
    "whoAmI": "Detailed first-person (minimum 150 words): Where I was born, grew up, occupation, what is important to me.",
    "hobbiesInterests": "What hobbies and interests I have - be specific.",
    "whatMakesGoodDay": "What makes a good day for me."
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
    "capacityAndSafeguarding": "First-person explanation of mental capacity (min 100 words)",
    "healthAndWellbeing": "Current health conditions and wellbeing (min 150 words)",
    "triggerPoints": "Signs indicating health changes",
    "medicationRequirements": "Medication needs and difficulties (min 100 words)",
    "nutrition": "Dietary needs, preferences, allergies (min 100 words)",
    "personalCareNeeds": "Personal care requirements in detail (min 150 words)",
    "mobilityAndEquipment": "How I move and equipment needed (min 100 words)",
    "houseworkAndSocial": "Housework and social support needed",
    "financialArrangements": "Finance management"
  },
  "riskSection1Health": {
    "speech": "Good/Impaired/Uses device",
    "speechDetails": "Details of speech",
    "hearing": "Good/Impaired/Uses aids",
    "hearingDetails": "Hearing details",
    "eyesight": "Good/Impaired/Uses glasses",
    "eyesightDetails": "Eyesight details",
    "breathlessness": "None/Mild/Moderate/Severe",
    "breathlessnessDetails": "Breathing details",
    "urinaryIncontinence": "None/Occasional/Frequent",
    "urinaryDetails": "Continence details",
    "faecalIncontinence": "None/Occasional/Frequent",
    "faecalDetails": "Details",
    "memory": "Good/Fair/Poor",
    "moods": "Stable/Variable/Low",
    "orientation": "Good/Confused at times/Disorientated",
    "sleepPattern": "Good/Disturbed/Poor",
    "behaviours": "None/Occasional/Frequent concerns",
    "understandsInfo": "Yes/Partially/No",
    "retainsInfo": "Yes/Partially/No",
    "weighsDecision": "Yes/Partially/No",
    "communicatesDecision": "Yes/Partially/No",
    "capacityDetails": "Capacity assessment details",
    "riskLevel": "Low/Medium/High",
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
    "prnMedication": "Yes/No and details",
    "covertMedication": "Yes/No",
    "pickingUpTablets": "Yes/No difficulty",
    "openingBoxes": "Yes/No difficulty",
    "pouringLiquids": "Yes/No difficulty",
    "usingDosageSystem": "Yes/No difficulty",
    "applyingCreams": "Yes/No difficulty",
    "swallowingTablets": "Yes/No difficulty",
    "understandingInstructions": "Yes/No difficulty",
    "managingInhalers": "Yes/No difficulty",
    "instillingDrops": "Yes/No difficulty",
    "controlledDrugs": "Details if any",
    "warfarin": "Details if applicable",
    "skinIntegrity": "Yes/No at risk",
    "skinDetails": "Skin concerns",
    "riskLevel": "Low/Medium/High",
    "riskPrevention": "Prevention measures"
  },
  "riskSection3Nutrition": {
    "mealAssistance": "Yes/No",
    "normalDiet": "Normal diet details",
    "specialDietary": "Special requirements",
    "foodAllergies": "Allergies",
    "softDiet": "Yes/No soft diet",
    "foodIntolerances": "Intolerances",
    "tubeFeed": "Yes/No",
    "supplementaryFoods": "Thickeners/supplements",
    "foodLikes": "Foods I like",
    "foodDislikes": "Foods I dislike",
    "portionSize": "Portion preferences",
    "mainMealTime": "Preferred meal time",
    "fluidIntake": "Fluid preferences",
    "riskLevel": "Low/Medium/High",
    "riskPrevention": "Prevention measures"
  },
  "riskSection4Equipment": {
    "equipment": [{"name": "Equipment", "fitForPurpose": "Yes/No", "supplier": "Name", "nextService": "Date"}],
    "remedialAction": "Safety measures",
    "riskLevel": "Low/Medium/High",
    "riskPrevention": "Prevention measures"
  },
  "riskSection5Mobility": {
    "weightBearing": "Full/Partial/None",
    "weightBearingDetails": "Details",
    "walking": "Independent/With aid/Unable",
    "walkingDetails": "Walking details",
    "stairs": "Independent/With support/Unable",
    "stairsDetails": "Stairs details",
    "sitToStand": "Independent/Needs help",
    "sitToStandDetails": "Details",
    "washing": "Independent/Needs assistance",
    "washingDetails": "Washing support details",
    "dressing": "Independent/Needs help",
    "dressingDetails": "Dressing details",
    "oralCare": "Independent/Needs help",
    "oralCareDetails": "Oral care details",
    "bathShower": "Bath/Shower preference and support",
    "toiletCommode": "Toilet support needed",
    "wheelchair": "Yes/No and details",
    "transfers": "How I transfer",
    "moveInBed": "Bed mobility",
    "inOutOfBed": "Bed transfers",
    "canBeLeftAlone": "Yes/No and duration",
    "proneToFalls": "Yes/No and history",
    "riskLevel": "Low/Medium/High",
    "riskPrevention": "Prevention measures"
  },
  "riskSection6Appliances": {
    "cooker": "Safe/Concerns/N/A",
    "microwave": "Safe/Concerns/N/A",
    "iron": "Safe/Concerns/N/A",
    "kettle": "Safe/Concerns/N/A",
    "toaster": "Safe/Concerns/N/A",
    "tumbleDryer": "Safe/Concerns/N/A",
    "floorCoverings": "Any hazards",
    "handRails": "In place",
    "electricBlanket": "Safe/Concerns",
    "bed": "Suitable/Concerns",
    "washingMachine": "Safe/Concerns",
    "centralHeating": "Working/Concerns",
    "actionsRequired": "Actions needed"
  },
  "riskSection7Fire": {
    "atRisk": "Yes/No",
    "riskReason": "Reason if at risk",
    "ragRating": "Red/Amber/Green",
    "plugSockets": "Overload concerns",
    "electricCables": "Cable safety",
    "smokingPolicy": "Explained Yes/No",
    "smokeAlarmLocation": "Location",
    "smokeAlarmWorking": "Yes/No",
    "coDetectorLocation": "CO detector location",
    "coDetectorWorking": "Yes/No",
    "canEvacuate": "Yes/No without help",
    "actionsAndSafety": "Safety measures"
  },
  "riskSection8COSHH": {
    "cleaningStorage": "Where cleaning materials stored",
    "riddorExplained": "Yes/No"
  },
  "riskSection9External": {
    "access": "Property access",
    "clearPathways": "Yes/No",
    "handrails": "External rails",
    "entranceSteps": "Steps details",
    "lighting": "External lighting",
    "ramps": "Any ramps",
    "personalSecurity": "Security concerns",
    "parking": "Parking situation",
    "actionsRequired": "Actions",
    "riskLevel": "Low/Medium/High",
    "riskPrevention": "Prevention"
  },
  "riskSection10Security": {
    "meansOfAccess": "Key safe/Key held/Other",
    "propertyType": "House/Flat/Bungalow",
    "enterUsing": "Front/Side/Back door",
    "keysafeConsent": "Yes/No",
    "gasShutOff": "Location",
    "stopTap": "Location",
    "fuseBox": "Location",
    "riskLevel": "Low/Medium/High",
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

      // Simulated progress during AI call
      let simulatedProgress = 25;
      progressInterval = setInterval(() => {
        if (simulatedProgress < 70) {
          simulatedProgress += 5;
          const messages = [
            "Analyzing document content...",
            "Generating personal profile...",
            "Creating care plan sections...",
            "Writing health assessments...",
            "Building risk evaluations...",
            "Compiling care requirements...",
            "Finalizing plan content...",
          ];
          const msgIndex = Math.floor((simulatedProgress - 25) / 7) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "ai_generation");
        }
      }, 3000);

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this document and generate a complete care plan template. Extract all relevant information and write detailed first-person content for each section:\n\n${contentToEnhance}` }
        ],
        temperature: 0,
        seed: 42,
        max_completion_tokens: 12000,
        response_format: { type: "json_object" },
      }, "plan_enhancer", aiUserContext);

      clearInterval(progressInterval);
      sendProgress(75, "Processing results...", "processing");

      const content = response.choices[0]?.message?.content || "";
      const result = parseJsonFromContent(content);
      if (result) {
        const scrubbedResult = sanitizeNarrativePII(result);
        const payload = allowSensitiveView ? { ...result, scrubbedResult } : scrubbedResult;
        
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', payload);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        sendEvent('error', { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error: any) {
      console.error("Plan Enhancement Error:", error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (progressInterval) clearInterval(progressInterval);
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "AI enhancement failed" })}\n\n`);
        return res.end();
      }
      return res.status(500).json({ message: error.message || "AI enhancement failed" });
    }
  });

  // ===== RISK ASSESSMENT LOG ROUTES =====

  // Create a risk assessment log
  app.post("/api/risk-assessment-logs", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const log = await storage.createRiskAssessmentLog(req.body);
      return res.status(201).json(log);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Get all risk assessment logs (admin only)
  app.get("/api/risk-assessment-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAllRiskAssessmentLogs();
      return res.json(logs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== ADMIN PORTAL ROUTES =====

  // Get session history (admin only)
  app.get("/api/admin/session-history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const history = await storage.getAllSessionHistory();
      return res.json(history);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Get suspension logs (admin only)
  app.get("/api/admin/suspension-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getSuspensionLogs();
      return res.json(logs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Suspend a user (admin only)
  app.post("/api/admin/users/:id/suspend", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { durationMinutes, reason } = req.body;
      
      if (!durationMinutes || durationMinutes < 2 || durationMinutes > 1440) {
        return res.status(400).json({ message: "Duration must be between 2 and 1440 minutes" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.role === "admin") {
        return res.status(403).json({ message: "Cannot suspend admin users" });
      }

      const now = new Date();
      const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

      await storage.suspendUser(req.params.id, endsAt);

      await storage.createSuspensionLog({
        userId: targetUser.id,
        username: targetUser.username,
        adminId: req.user.id,
        adminUsername: req.user.username,
        durationMinutes,
        reason: reason || null,
        startsAt: now,
        endsAt,
      });

      await storage.deleteActiveSessionByUserId(req.params.id);
      
      sendToUser(req.params.id, {
        type: "FORCE_LOGOUT",
        message: `You have been suspended for ${durationMinutes} minutes.${reason ? ` Reason: ${reason}` : ""}`,
      });

      return res.json({ message: "User suspended", suspendedUntil: endsAt });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Reinstate a suspended user (admin only)
  app.post("/api/admin/users/:id/reinstate", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.suspendUser(req.params.id, null);
      
      const logs = await storage.getSuspensionLogsByUser(req.params.id);
      if (logs.length > 0 && logs[0].endsAt > new Date()) {
        await storage.reinstateSuspension(logs[0].id);
      }

      return res.json({ message: "User reinstated" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Kick a user (force logout without suspension) (admin only)
  app.post("/api/admin/users/:id/kick", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.role === "admin") {
        return res.status(403).json({ message: "Cannot kick admin users" });
      }

      const activeSession = await storage.getActiveSessionByUserId(req.params.id);
      if (activeSession) {
        await storage.updateSessionLogout(activeSession.sessionId, true);
        await storage.deleteActiveSession(activeSession.sessionId);
        
        if (sessionStore) {
          sessionStore.destroy(activeSession.sessionId, (err: any) => {
            if (err) console.error("Failed to destroy session:", err);
          });
        }
        
        sendToUser(req.params.id, {
          type: "FORCE_LOGOUT",
          message: "You have been logged out by an administrator.",
        });
      }

      return res.json({ message: "User kicked" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Update user name (admin only)
  app.patch("/api/admin/users/:id/name", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { firstName, lastName } = req.body;
      const user = await storage.updateUserName(req.params.id, firstName || null, lastName || null);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        jobTitle: user.jobTitle,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Get comprehensive audit trail (admin only)
  app.get("/api/admin/audit-trail", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [riskLogs, discrepancies, suspensionLogs, sessionHistoryData] = await Promise.all([
        storage.getAllRiskAssessmentLogs(),
        storage.getAllDiscrepancies(),
        storage.getSuspensionLogs(),
        storage.getAllSessionHistory(),
      ]);

      return res.json({
        riskAssessments: riskLogs,
        discrepancies,
        suspensions: suspensionLogs,
        sessionHistory: sessionHistoryData,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Get users with presence info (admin only)
  app.get("/api/admin/users-presence", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [allUsers, activeSess] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllActiveSessions(),
      ]);

      const activeUserIds = new Set(activeSess.map(s => s.userId));

      const usersWithPresence = allUsers.map(u => ({
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        status: u.status,
        jobTitle: u.jobTitle,
        suspendedUntil: u.suspendedUntil,
        lastOnlineAt: u.lastOnlineAt,
        isOnline: activeUserIds.has(u.id),
        currentSession: activeSess.find(s => s.userId === u.id) || null,
      }));

      return res.json(usersWithPresence);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Get all blocked IPs (admin only)
  app.get("/api/admin/blocked-ips", requireAuth, requireAdmin, async (req, res) => {
    try {
      const blockedIps = await storage.getAllBlockedIps();
      return res.json(blockedIps);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Block an IP address (admin only)
  app.post("/api/admin/block-ip", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { ipAddress, reason, username } = req.body;
      
      if (!ipAddress) {
        return res.status(400).json({ message: "IP address is required" });
      }
      
      // Check if already blocked
      const existing = await storage.getBlockedIpByAddress(ipAddress);
      if (existing) {
        return res.status(400).json({ message: "IP address is already blocked" });
      }
      
      const blocked = await storage.blockIp({
        ipAddress,
        blockedBy: req.user.username,
        reason: reason || null,
        username: username || null,
      });
      
      return res.json(blocked);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Unblock an IP address (admin only)
  app.delete("/api/admin/blocked-ips/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.unblockIp(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // ===== EMAIL ASSISTANT ROUTE =====
  app.post("/api/ai/rewrite-email", requireAuth, async (req: any, res) => {
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    try {
      const { inputText, tone } = req.body;
      
      if (!inputText || !tone) {
        return res.status(400).json({ message: "Input text and tone are required" });
      }

      const toneInstructions: Record<string, string> = {
        professional: `Write in a formal, professional tone. Use proper business language, be courteous and respectful. Structure with proper greeting, clear paragraphs, and professional closing. Avoid casual language or contractions.`,
        direct: `Write in a clear, concise, and to-the-point style. Get straight to the business matter. Be brief but not rude. Use short sentences and clear action items. Minimize pleasantries but remain polite.`,
        empathetic: `Write in a warm, understanding, and supportive tone. Show genuine care for the recipient's situation. Use friendly language while remaining professional. Acknowledge their efforts and offer help. Be encouraging and positive.`
      };

      const systemPrompt = `You are an expert email writer for UK care facilities. Your task is to take rough notes, bullet points, or draft text and transform it into a polished, well-structured email.

TONE: ${tone.toUpperCase()}
${toneInstructions[tone] || toneInstructions.professional}

RULES:
1. Transform the user's rough input into a complete, polished email
2. Keep the core message and intent from the user's input
3. Add appropriate greeting and sign-off
4. Use UK English spelling (e.g., "organise" not "organize")
5. Keep it concise but complete
6. If the input mentions specific people, dates, or details, include them
7. Format with proper paragraphs for readability
8. Use [Recipient Name] and [Your Name] as placeholders

Return ONLY the email text, nothing else.`;

      const response = await createChatCompletionWithLogging({
        model: getLowCostModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: inputText }
        ],
        max_completion_tokens: 1000,
        temperature: 0.2,
        seed: 42,
      }, "email_assistant", aiUserContext);

      const rewrittenEmail = response.choices[0]?.message?.content;
      
      if (!rewrittenEmail) {
        return res.status(500).json({ message: "Failed to generate email" });
      }

      return res.json({ rewrittenEmail });
    } catch (error: any) {
      console.error("Email rewrite error:", error);
      return res.status(500).json({ message: error.message || "Failed to rewrite email" });
    }
  });

  // ===== PRN PROTOCOL GENERATION =====
  app.post("/api/ai/generate-prn-protocol", requireAuth, async (req: any, res) => {
    // User context for AI cost tracking
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    
    try {
      const { medicationName, existingData } = req.body;
      
      if (!medicationName) {
        return res.status(400).json({ message: "Medication name is required" });
      }

      const systemPrompt = `You are an expert UK care facility medication protocol writer. Generate a comprehensive PRN (Pro Re Nata / "as needed") medication protocol for use in a care home setting.

The protocol must follow UK care standards and regulations. Generate a complete, professional protocol that care workers can follow.

IMPORTANT: Return the response as a JSON object with the following exact structure:
{
  "medicationName": "Name of the medication",
  "dose": "Recommended dosage (e.g., '500mg', '1-2 tablets')",
  "route": "Route of administration (e.g., 'Oral', 'Topical', 'Sublingual')",
  "frequency": "How often it can be given (e.g., 'Up to 4 times daily as needed')",
  "maxDoseIn24Hours": "Maximum allowed in 24 hours (e.g., '4g (8 x 500mg tablets)')",
  "minimumTimeBetweenDoses": "Minimum gap between doses (e.g., '4 hours')",
  "specialInstructions": "Any special instructions for administration",
  "reasonsForAdministration": "List of symptoms/reasons when this medication should be given",
  "predictableSideEffects": "Common side effects to monitor for",
  "additionalComments": "Any other relevant information for care workers"
}

Use UK English spelling. Be specific and clinically accurate. If the medication is commonly used in care settings, use standard clinical guidelines for dosing.`;

      const userPrompt = existingData 
        ? `Generate a complete PRN protocol for: ${medicationName}\n\nExisting information available:\n${JSON.stringify(existingData, null, 2)}\n\nPlease enhance and complete this protocol with all required fields.`
        : `Generate a complete PRN protocol for: ${medicationName}`;

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_completion_tokens: 1500,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "prn_protocol", aiUserContext);

      const content = response.choices[0]?.message?.content || "";
      
      if (!content) {
        return res.status(500).json({ message: "Failed to generate PRN protocol" });
      }

      const protocol = parseJsonFromContent(content);
      if (!protocol) {
        console.error("Failed to parse PRN protocol response");
        return res.status(500).json({ message: "Failed to parse generated protocol" });
      }
      return res.json({ protocol });
    } catch (error: any) {
      console.error("PRN protocol generation error:", error);
      return res.status(500).json({ message: error.message || "Failed to generate PRN protocol" });
    }
  });

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
      return res.status(500).json({ message: error.message || "Failed to create refusal review" });
    }
  });

  // Get all refusal reviews
  app.get("/api/refusal-reviews", requireAuth, async (req, res) => {
    try {
      const reviews = await storage.getAllRefusalReviews();
      return res.json(reviews);
    } catch (error: any) {
      console.error("Get refusal reviews error:", error);
      return res.status(500).json({ message: error.message || "Failed to get refusal reviews" });
    }
  });

  // Update a refusal review
  app.patch("/api/refusal-reviews/:id", requireAuth, async (req, res) => {
    try {
      const { reasonAcceptable, reviewerNotes } = req.body;
      
      // Get the authenticated user to track who made the update
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
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
      return res.status(500).json({ message: error.message || "Failed to update refusal review" });
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
      return res.status(500).json({ message: error.message || "Failed to create refusal reviews" });
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
      return res.status(500).json({ message: error.message || "Failed to save EMAR corrections" });
    }
  });

  // NOTE: EMAR corrections are accessed internally via storage.getRecentEmarCorrections()
  // No public GET endpoint to protect sensitive correction data (admin-only access)

  // Get current AI provider preference (admin-only)
  app.get("/api/admin/ai-provider", requireAuth, requireAdmin, async (req, res) => {
    try {
      const provider = getPreferredProvider();
      const hasOpenAIKey = !!(process.env.OPENAI_FALLBACK_API_KEY || process.env.OPENAI_API_KEY);
      return res.json({ provider, hasOpenAIKey });
    } catch (error: any) {
      console.error("AI provider fetch error:", error);
      return res.status(500).json({ message: error.message || "Failed to fetch AI provider" });
    }
  });

  // Set AI provider preference (admin-only)
  app.post("/api/admin/ai-provider", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { provider } = req.body;
      if (provider !== "openai") {
        return res.status(400).json({ message: "Invalid provider. Must be 'openai'." });
      }
      
      // Check if OpenAI key is configured before allowing switch
      if (!process.env.OPENAI_FALLBACK_API_KEY && !process.env.OPENAI_API_KEY) {
        return res.status(400).json({ message: "OpenAI API key not configured. Set OPENAI_API_KEY or OPENAI_FALLBACK_API_KEY." });
      }
      
      setPreferredProvider(provider as AiProvider);
      
      console.log(`[Admin] AI provider changed to ${provider} by ${req.user?.username || 'unknown'}`);
      
      return res.json({ success: true, provider });
    } catch (error: any) {
      console.error("AI provider update error:", error);
      return res.status(500).json({ message: error.message || "Failed to update AI provider" });
    }
  });

  // NOTE: AI model selection removed - now uses tiered approach automatically:
  // - GPT-4.1-mini for core EMAR extraction (accuracy critical)
  // - GPT-4o-mini for auxiliary tasks (count validation, equivalence, drug interactions, validation passes)

  // Get AI usage logs and stats (admin-only)
  app.get("/api/ai-usage", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAiUsageLogs({ limit: 100 });
      const stats = await storage.getAiUsageStats();
      
      return res.json({ logs, stats });
    } catch (error: any) {
      console.error("AI usage fetch error:", error);
      return res.status(500).json({ message: error.message || "Failed to fetch AI usage" });
    }
  });

  // =====================================================================
  // CALL RECONCILIATION - Excel Processing
  // =====================================================================
  
  // Helper to convert column letter to index (A=0, B=1, etc.)
  function colLetterToIndex(letter: string): number {
    let result = 0;
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 64);
    }
    return result - 1;
  }

  // Helper to convert index to column letter
  function indexToColLetter(index: number): string {
    let result = "";
    while (index >= 0) {
      result = String.fromCharCode((index % 26) + 65) + result;
      index = Math.floor(index / 26) - 1;
    }
    return result;
  }

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
      return res.status(500).json({ message: error.message || "Failed to analyze service order images" });
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
      return res.status(500).json({ message: error.message || "Failed to compare support plan" });
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
        workbook = XLSX.read(csvString, { type: "string", cellDates: true });
        console.log(`[Reconciliation] Parsed CSV file, converting to Excel format`);
      } else {
        // Read the Excel file with date parsing enabled
        workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to array of arrays for easier manipulation
      const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

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
      const newWorkbook = XLSX.utils.book_new();
      const newWorksheet = XLSX.utils.aoa_to_sheet(processedData, { cellDates: true });
      
      // Apply date format to cells that contain Date objects
      const range = XLSX.utils.decode_range(newWorksheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = newWorksheet[cellAddress];
          if (cell && cell.t === 'd') {
            // Format as date with time: DD/MM/YYYY HH:MM:SS
            cell.z = 'DD/MM/YYYY HH:MM:SS';
          }
        }
      }
      
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Reconciled");

      // Generate Excel buffer
      const excelBuffer = XLSX.write(newWorkbook, { type: "buffer", bookType: "xlsx" });

      // Set response headers for file download
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="reconciled_${Date.now()}.xlsx"`);
      
      console.log(`[Reconciliation] Processed ${processedData.length} rows, sending Excel file`);
      
      return res.send(excelBuffer);
    } catch (error: any) {
      console.error("Reconciliation error:", error);
      return res.status(500).json({ message: error.message || "Failed to process Excel file" });
    }
  });

  // =====================================================================
  // CONTACT FORM - Stores messages for admin review
  // =====================================================================

  // Contact form is always enabled (no SMTP required)
  app.get("/api/contact/status", async (req, res) => {
    return res.json({ enabled: true });
  });

  // Submit contact form message (public endpoint)
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, organisation, message } = req.body;

      // Validation
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({ message: "Please enter your name" });
      }
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }
      if (!message || typeof message !== "string" || message.trim().length < 10) {
        return res.status(400).json({ message: "Please enter a message (at least 10 characters)" });
      }

      // Sanitize inputs
      const sanitizedName = name.trim().slice(0, 100);
      const sanitizedEmail = email.trim().slice(0, 100);
      const sanitizedOrg = organisation ? String(organisation).trim().slice(0, 100) : null;
      const sanitizedMessage = message.trim().slice(0, 5000);

      // Save to database
      await storage.createContactMessage({
        name: sanitizedName,
        email: sanitizedEmail,
        organisation: sanitizedOrg,
        message: sanitizedMessage,
      });

      console.log(`[Contact] Message saved from ${sanitizedEmail} (${sanitizedName})`);

      return res.json({ 
        success: true, 
        message: "Thank you for your message. We'll respond within 1 business day." 
      });
    } catch (error: any) {
      console.error("[Contact] Failed to save message:", error);
      return res.status(500).json({ 
        message: "Failed to send message. Please try again later." 
      });
    }
  });

  // Get all contact messages (admin only)
  app.get("/api/contact/messages", requireAuth, requireAdmin, async (req: any, res: any) => {
    try {
      const includeArchived = req.query.includeArchived === "true";
      const messages = await storage.getContactMessages(includeArchived);
      return res.json(messages);
    } catch (error: any) {
      console.error("[Contact] Failed to fetch messages:", error);
      return res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Mark message as read (admin only)
  app.patch("/api/contact/messages/:id/read", requireAuth, requireAdmin, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await storage.markContactMessageRead(id, req.user.username);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Contact] Failed to mark message as read:", error);
      return res.status(500).json({ message: "Failed to update message" });
    }
  });

  // Archive message (admin only)
  app.patch("/api/contact/messages/:id/archive", requireAuth, requireAdmin, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await storage.archiveContactMessage(id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Contact] Failed to archive message:", error);
      return res.status(500).json({ message: "Failed to archive message" });
    }
  });

  // Delete message (admin only)
  app.delete("/api/contact/messages/:id", requireAuth, requireAdmin, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await storage.deleteContactMessage(id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Contact] Failed to delete message:", error);
      return res.status(500).json({ message: "Failed to delete message" });
    }
  });

  return httpServer;
}
