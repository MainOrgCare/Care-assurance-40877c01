import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pkg from "pg";
const { Pool } = pkg;
import { z } from "zod";
import { insertUserSchema, insertCareWorkerSchema, insertDiscrepancySchema, insertAuditSchema, insertAdminAlertSchema, insertPolicyDocumentSchema } from "@shared/schema";
import { createChatCompletion, createChatCompletionWithLogging, openai } from "./services/aiClient";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { scanFile, computeFileHash, getCachedScan } from "./services/fileScan";
import { convertPdfToImages } from "./services/pdfToImages";
// Vision-based extraction for improved EMAR accuracy

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    const isDocx = file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.originalname.toLowerCase().endsWith(".docx");
    if (isPdf || isDocx) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and Word (.docx) files are allowed"));
    }
  }
});

const MAX_NON_ADMIN_SESSIONS = 2;
const FORCE_LOGOUT_WARNING_SECONDS = 30;

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

    // Log the scan result
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

    if (!scanResult.isClean) {
      // Log security threat - the fileScanLogs table provides the audit trail
      console.error(`[SECURITY ALERT] Threat detected in file "${file.originalname}": ${scanResult.threatsFound}. Upload blocked by ${scannedBy || 'unknown user'}.`);

      return {
        allowed: false,
        error: `File rejected: Security threat detected. The file "${file.originalname}" contains malware and cannot be uploaded.`,
      };
    }

    return { allowed: true };
  } catch (error: any) {
    console.error("Virus scan error:", error);
    // If scan fails, we should not allow the upload for security
    return {
      allowed: false,
      error: `File scan failed: ${error.message}. Please try again later.`,
    };
  }
}

const connectedClients: Map<string, WebSocket> = new Map();
let sessionStore: any = null;

// the newest OpenAI model is "gpt-5.1" - do not change this unless explicitly requested by the user
// Using AI client wrapper with automatic failover to direct OpenAI if Replit AI fails


// Clinical/medical whitelist to prevent false positive name detection
const CLINICAL_WHITELIST = new Set([
  'alzheimer', 'parkinson', 'huntington', 'crohn', 'addison', 'hodgkin', 'raynaud',
  'bartholin', 'cushing', 'graves', 'hashimoto', 'meniere', 'paget', 'bell',
  'down syndrome', 'turner syndrome', 'klinefelter', 'marfan', 'ehlers danlos',
  'asperger', 'guillain barre', 'lou gehrig', 'wilson disease', 'bright disease'
]);

// Check if a phrase is in the clinical whitelist
function isClinicalTerm(phrase: string): boolean {
  return CLINICAL_WHITELIST.has(phrase.toLowerCase());
}

// Privacy scrubbing utility - ensures no full names or DOBs leak through
function scrubPII(data: any): any {
  if (typeof data === 'string') {
    let scrubbed = data;
    
    // 1. Remove DOB patterns (DD/MM/YYYY, DD-MM-YYYY, D/M/YY, etc.)
    scrubbed = scrubbed.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, '[REDACTED]');
    
    // 2. Remove "My name is [Name]" patterns
    scrubbed = scrubbed.replace(/\b(my name is|i am called|i'm called|call me)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*/gi, '$1 [SERVICE USER]');
    
    // 3. Remove possessive name patterns like "John's" or "Mary's" (except for clinical terms)
    scrubbed = scrubbed.replace(/\b([A-Z][a-z]+)'s\b/g, (match, name) => {
      if (isClinicalTerm(name)) return match;
      return "[SERVICE USER]'s";
    });
    
    // 4. Remove ALL likely full name patterns: two or more capitalized words anywhere
    // This catches names at sentence start, after newlines, in bullets, etc.
    // Pattern: Capitalized word + space + (optional prefix) + Capitalized word
    scrubbed = scrubbed.replace(/\b([A-Z][a-z]+)\s+((?:O'|Mc|Mac)?[A-Z][a-z]+)(?:\s+((?:O'|Mc|Mac)?[A-Z][a-z]+))?\b/g, (match, first, second, third) => {
      // Check if it's a clinical term
      if (isClinicalTerm(match) || isClinicalTerm(first) || isClinicalTerm(second)) {
        return match;
      }
      // Common non-name phrases to whitelist (medical, care-related, risk assessment categories)
      const commonPhrases = [
        // Care-related terms
        'care plan', 'care worker', 'care home', 'care needs', 'risk assessment', 'personal care', 
        'mental health', 'social worker', 'general practitioner', 'district nurse', 'care staff', 'care team',
        'health visitor', 'care manager', 'service user', 'family member', 'next of kin', 'emergency contact',
        // Risk assessment categories
        'falls prevention', 'fire safety', 'skin integrity', 'medication administration', 'infection control',
        'environmental safety', 'lone working', 'behavior support', 'communication support', 'dementia care',
        'end of life', 'epilepsy management', 'diabetes management', 'nutrition assessment', 'continence care',
        'mobility assessment', 'moving and handling', 'mobility moving', 'safeguarding adults', 'safeguarding children',
        'coshh assessment', 'manual handling', 'pressure areas', 'tissue viability', 'wound care',
        // Care plan sections
        'initial assessment', 'care planning', 'daily living', 'personal hygiene', 'oral care',
        'food preparation', 'medication support', 'emotional support', 'social activities',
        // Medical terms
        'blood pressure', 'heart rate', 'respiratory rate', 'oxygen saturation', 'body temperature',
        'weight management', 'pain management', 'symptom control', 'palliative care',
        // Other common phrases
        'health and safety', 'dignity and respect', 'person centred', 'person centered',
        'best practice', 'quality assurance', 'clinical governance', 'duty of care'
      ];
      if (commonPhrases.includes(match.toLowerCase())) {
        return match;
      }
      return '[SERVICE USER]';
    });
    
    return scrubbed;
  }
  if (Array.isArray(data)) {
    return data.map(item => scrubPII(item));
  }
  if (typeof data === 'object' && data !== null) {
    const scrubbed: any = {};
    for (const key of Object.keys(data)) {
      scrubbed[key] = scrubPII(data[key]);
    }
    return scrubbed;
  }
  return data;
}

// Validate and normalize service user initials
function normalizeInitials(name: string | undefined | null): string {
  if (!name) return 'N.N.';
  const trimmed = name.trim();
  
  // Check if already in initials format (X.X. or X.X)
  if (/^[A-Z]\.[A-Z]\.?$/i.test(trimmed)) {
    return trimmed.endsWith('.') ? trimmed : trimmed + '.';
  }
  
  // If it looks like a full name (multiple words or longer than 4 chars), extract initials
  if (trimmed.includes(' ') || trimmed.length > 4) {
    const parts = trimmed.split(/[\s.]+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      return parts[0][0].toUpperCase() + '.' + parts[parts.length - 1][0].toUpperCase() + '.';
    } else if (parts.length === 1) {
      return parts[0][0].toUpperCase() + '.N.';
    }
  }
  
  return 'N.N.';
}

// Drug interaction type definition
interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'high' | 'moderate' | 'low';
  description: string;
}

// Check for potentially dangerous drug-drug interactions
async function checkDrugInteractions(
  medications: Array<{ name: string; genericName?: string; [key: string]: any }>
): Promise<DrugInteraction[]> {
  if (!medications || medications.length < 2) {
    return [];
  }

  const medList = medications.map(m => 
    m.genericName ? `${m.name} (${m.genericName})` : m.name
  ).join(', ');

  try {
    const response = await createChatCompletionWithLogging({
      model: "gpt-5.1",
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
      response_format: { type: "json_object" }
    }, "drug_interactions");

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    if (parsed.interactions && Array.isArray(parsed.interactions)) {
      return parsed.interactions.map((i: any) => ({
        drug1: i.drug1 || "",
        drug2: i.drug2 || "",
        severity: ["high", "moderate", "low"].includes(i.severity) ? i.severity : "moderate",
        description: i.description || ""
      }));
    }
    
    return [];
  } catch (error: any) {
    console.error("[Drug Interactions] Check failed:", error.message);
    return [];
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

  // Function to send message to a specific user
  const sendToUser = (userId: string, message: any) => {
    const client = connectedClients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  };

  // Function to force logout a user with warning
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
      
      // Destroy Express session from store
      if (sessionStore) {
        sessionStore.destroy(activeSession.sessionId, (err: any) => {
          if (err) console.error("Failed to destroy session:", err);
        });
      }
      
      await storage.deleteActiveSession(activeSession.sessionId);
    }, FORCE_LOGOUT_WARNING_SECONDS * 1000);
  };

  // PostgreSQL session store
  const PgSession = connectPgSimple(session);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  sessionStore = new PgSession({ pool, createTableIfMissing: true });
  
  // Trust proxy for production (Replit uses reverse proxies)
  app.set("trust proxy", 1);
  
  // Session middleware (skip for Vite HMR WebSocket)
  const isReplit = !!process.env.REPL_ID;
  const sessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "carecompli-secret-key-change-in-prod",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      // SameSite=None requires Secure=true. Replit proxy uses HTTPS, so this works.
      // partitioned: true enables CHIPS (Cookies Having Independent Partitioned State) for iframe contexts
      secure: isReplit || process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: isReplit ? "none" : "lax",
      maxAge: 1000 * 60 * 30, // 30 minutes - auto logout on inactivity
      partitioned: isReplit, // Required for third-party cookie access in Chrome's privacy sandbox
    } as any, // Type assertion needed for partitioned attribute
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
    if (!activeSession) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Session expired" });
    }
    
    // Update last activity
    await storage.updateSessionActivity(req.sessionID);
    
    req.user = user;
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
      const { username, password } = req.body;
      const clientIp = getClientIp(req);
      
      // Check if IP is blocked
      if (clientIp && clientIp !== 'unknown') {
        const isBlocked = await storage.isIpBlocked(clientIp);
        if (isBlocked) {
          return res.status(403).json({ message: "Access denied. Your IP address has been blocked." });
        }
      }
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await storage.verifyPassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.status !== "active") {
        return res.status(403).json({ message: "Account pending approval" });
      }

      // Check if user is suspended
      if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.suspendedUntil).getTime() - Date.now()) / 60000);
        return res.status(403).json({ 
          message: `Account suspended. Please try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
        });
      }

      // Check session limits for non-admin users
      const isAdmin = user.role === "admin";
      const nonAdminCount = await storage.getNonAdminSessionCount();
      
      let forcingLogout = false;
      
      if (!isAdmin && nonAdminCount >= MAX_NON_ADMIN_SESSIONS) {
        return res.status(503).json({ 
          message: `System is at capacity (${MAX_NON_ADMIN_SESSIONS} users). Please try again later.` 
        });
      }
      
      // Admin priority: if admin logs in and all slots are full, force logout oldest non-admin
      if (isAdmin && nonAdminCount >= MAX_NON_ADMIN_SESSIONS) {
        const nonAdminSessions = await storage.getNonAdminActiveSessions();
        if (nonAdminSessions.length > 0) {
          const oldestSession = nonAdminSessions[0];
          await forceLogoutUser(oldestSession);
          forcingLogout = true;
        }
      }

      req.session.userId = user.id;
      
      // Explicitly save session before responding
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
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
        forcingLogout,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Demo Login - TEMPORARILY DISABLED
  // To re-enable, uncomment this endpoint
  /*
  app.post("/api/auth/demo", async (req, res) => {
    try {
      const clientIp = getClientIp(req);
      
      // Check if IP is blocked
      if (clientIp && clientIp !== 'unknown') {
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
  */

  // Register (creates pending user)
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...validatedData,
        role: validatedData.role || "staff",
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
      
      if (newPassword.length < 4) {
        return res.status(400).json({ message: "New password must be at least 4 characters" });
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

  // Admin reset user password to 'test'
  app.post("/api/admin/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const bcrypt = await import("bcrypt");
      const hashedPassword = await bcrypt.default.hash("test", 10);
      await storage.updateUserPassword(req.params.id, hashedPassword);
      
      return res.json({ message: `Password reset to 'test' for user ${user.username}` });
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
        const parser = new PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        content = result.pages.map((p: any) => p.text).join("\n");
        await parser.destroy();
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
        const parser = new PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        text = result.pages.map((p: any) => p.text).join("\n");
        await parser.destroy();
      }

      res.json({ text });
    } catch (error: any) {
      console.error("Document parsing error:", error);
      res.status(500).json({ message: "Failed to parse document" });
    }
  });

  // Analyze EMAR document using AI-based extraction with streaming progress
  app.post("/api/ai/analyze-emar", requireAuth, upload.single("file"), async (req, res) => {
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
    const user = await storage.getUser(req.session.userId!);
    const scanCheck = await scanAndLogFile(req.file, "emar-analysis", user?.username);
    if (!scanCheck.allowed) {
      return res.status(400).json({ message: scanCheck.error });
    }
    
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

      // STEP 1: Extract text from PDF (primary method while Vision API unavailable)
      let documentText = "";
      try {
        const parser = new PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        
        // Debug: Log page-level extraction details
        console.log(`DEBUG: PDF has ${result.pages?.length || 0} pages`);
        if (result.pages && result.pages.length > 0) {
          result.pages.forEach((p: any, idx: number) => {
            console.log(`DEBUG: Page ${idx + 1} has ${p.text?.length || 0} chars`);
          });
        }
        
        // Also try result.text as fallback (combined text from all pages)
        if (result.text && result.text.length > 0) {
          documentText = result.text;
          console.log(`DEBUG: Using result.text (combined): ${documentText.length} chars`);
        } else if (result.pages && result.pages.length > 0) {
          documentText = result.pages.map((p: any) => p.text || '').join("\n\n--- PAGE BREAK ---\n\n");
          console.log(`DEBUG: Using result.pages (joined): ${documentText.length} chars`);
        }
        
        await parser.destroy();
        console.log(`DEBUG: Final extracted text: ${documentText.length} chars from PDF`);
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
      
      // Maximum text length to send to AI (200K chars ~ 50K tokens, well within GPT-5.1's 1M context)
      // This handles documents up to ~100 pages - typical EMAR is 2-10 pages per week
      const MAX_DOC_TEXT_LENGTH = 200000;
      const isDocumentTruncated = documentText.length > MAX_DOC_TEXT_LENGTH;
      if (isDocumentTruncated) {
        console.warn(`WARNING: Document text truncated from ${documentText.length} to ${MAX_DOC_TEXT_LENGTH} chars. Some medications may be missed.`);
        // Send warning to client so they know document was partially analyzed
        sendEvent('warning', { 
          message: `Document is very large (${Math.round(documentText.length / 1000)}K chars). Analyzing first ~200K characters. If medications are missing, try splitting the document.`
        });
      }
      const analysisText = isDocumentTruncated ? documentText.substring(0, MAX_DOC_TEXT_LENGTH) : documentText;
      
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
      
      sendProgress(10, "Analyzing EMAR document...", "metadata_extraction");

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
      
      const metadataPrompt = `You are an EMAR (Electronic Medication Administration Record) data extractor analyzing EMAR document text.
This tool works with ANY EMAR system from ANY provider (e.g., CMM, CarePlanner, MedPass, PCS, etc.).
${tableStructureContext}
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
   - isPRN: true if labeled "PRN", "as needed", "when required", or in a separate PRN section
   - instructions: The dosage/administration instructions
   - requiredGapHours: Minimum hours between doses (default 4 for most meds, 6-8 for controlled drugs)
   - scheduledTimeSlots: The time slots that apply to this medication
4. dates: Extract ALL dates visible in the EXACT format shown
5. timeSlots: Look for time windows in the document

IMPORTANT: Extract exactly what you see in the text - don't guess or make assumptions.`;

      const DETERMINISTIC_SEED = 42;
      
      const metadataResponse = await createChatCompletion({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: metadataPrompt },
          { role: "user", content: `Analyze this EMAR document and extract the metadata:\n\n${analysisText}` }
        ],
        max_completion_tokens: 4000,
        temperature: 0,
        seed: DETERMINISTIC_SEED,
        response_format: { type: "json_object" },
      });
      
      const metadataContent = metadataResponse.choices[0]?.message?.content || "{}";
      
      let metadata = {
        serviceUserInitials: "",
        allergies: "",
        medications: [] as any[],
        dates: [] as string[],
        timeSlots: [] as string[]
      };
      
      try {
        metadata = JSON.parse(metadataContent);
        console.log("DEBUG: Metadata extracted -", metadata.medications?.length, "medications,", metadata.dates?.length, "dates,", metadata.timeSlots?.length, "timeSlots");
        sendProgress(15, `Found ${metadata.medications?.length || 0} medications...`, "metadata_complete");
      } catch (e) {
        console.error("Failed to parse metadata JSON:", e);
        console.error("Raw metadata content:", metadataContent);
        sendEvent('error', { message: "Failed to parse medication data from document" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
      
      // Validate that we actually found medications
      if (!metadata.medications || metadata.medications.length === 0) {
        console.error("No medications found in metadata");
        sendEvent('error', { message: "No medications found in the document. Please check the PDF contains medication records." });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
      
      // =====================================================================
      // DRUG INTERACTION CHECK
      // =====================================================================
      sendProgress(16, "Checking for drug interactions...", "drug_interaction_check");
      const drugInteractions = await checkDrugInteractions(metadata.medications);
      if (drugInteractions.length > 0) {
        console.log(`DEBUG: Found ${drugInteractions.length} potential drug interactions`);
        const highSeverity = drugInteractions.filter(d => d.severity === 'high').length;
        if (highSeverity > 0) {
          sendEvent('warning', { 
            message: `ALERT: ${highSeverity} high-severity drug interaction(s) detected. Review medications carefully.`
          });
        }
      }
      
      // =====================================================================
      // DATE COUNT VALIDATION: Compare AI dates vs pre-parsed dates
      // =====================================================================
      const aiDateCount = metadata.dates?.length || 0;
      const preParseCount = preAnalysis.dateCount;
      const dateMismatch = Math.abs(aiDateCount - preParseCount);
      
      console.log("=== DATE VALIDATION ===");
      console.log(`AI detected dates: ${aiDateCount}`);
      console.log(`Pre-parse detected dates: ${preParseCount}`);
      console.log(`Mismatch: ${dateMismatch} dates`);
      
      // If mismatch is significant (>2 dates difference), prefer pre-parsed dates
      if (preParseCount > 0 && dateMismatch > 2) {
        console.warn(`WARNING: AI date count (${aiDateCount}) differs significantly from pre-parsed count (${preParseCount}). Using pre-parsed dates.`);
        metadata.dates = preAnalysis.dates;
        console.log(`Corrected dates to: ${metadata.dates.join(', ')}`);
        sendEvent('warning', { 
          message: `Date count corrected: AI detected ${aiDateCount} dates, but document structure shows ${preParseCount} dates. Using validated count.`
        });
      } else if (preParseCount > 0 && aiDateCount !== preParseCount) {
        // Minor mismatch - log but don't override
        console.log(`INFO: Minor date count difference (AI: ${aiDateCount}, Pre-parse: ${preParseCount}). Keeping AI dates.`);
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
      
      const medicationCountPrompt = `Analyze the EMAR document text and count how many DISTINCT medications are listed. Return a JSON object with the count: {"count": 5}`;
      
      const countMedications = async (): Promise<number> => {
        try {
          const response = await createChatCompletion({
            model: "gpt-5.1",
            messages: [
              { role: "system", content: medicationCountPrompt },
              { role: "user", content: `Count medications in this document:\n\n${analysisText}` }
            ],
            max_completion_tokens: 100,
            temperature: 0,
            seed: DETERMINISTIC_SEED,
            response_format: { type: "json_object" },
          });
          const content = response.choices[0]?.message?.content || '{"count":0}';
          const parsed = JSON.parse(content);
          return parsed.count || 0;
        } catch (e) {
          console.error(`Medication count error:`, e);
          return 0;
        }
      };
      
      // COST OPTIMIZATION: Single pass for count, only run consensus if mismatch
      const extractedMedicationCount = metadata.medications?.length || 0;
      const firstCount = await countMedications();
      let agreedMedicationCount = firstCount;
      let medicationCountConsensus = true;
      
      if (firstCount !== extractedMedicationCount) {
        // Mismatch - run one more pass to confirm
        const secondCount = await countMedications();
        if (secondCount === firstCount) {
          agreedMedicationCount = firstCount;
          console.log(`DEBUG: Medication count confirmed: ${agreedMedicationCount} (2 passes agreed)`);
        } else if (secondCount === extractedMedicationCount) {
          agreedMedicationCount = extractedMedicationCount;
          console.log(`DEBUG: Medication count matches metadata: ${agreedMedicationCount}`);
        } else {
          // Still mismatch, trust metadata
          agreedMedicationCount = extractedMedicationCount;
          medicationCountConsensus = false;
          forceMultiPass = true;
          console.warn(`DEBUG: Medication count mismatch - using metadata: ${extractedMedicationCount}`);
        }
      } else {
        console.log(`DEBUG: Medication count validated on first pass: ${agreedMedicationCount}`);
      }
      
      sendProgress(25, "Count validation complete...", "count_complete");

      // Phase 2: Extract entries using per-medication prompts for reliability
      // Assign each medication an index for deterministic matching
      const medicationsWithIds = (metadata.medications || []).map((m: any, i: number) => ({
        ...m,
        medicationId: i + 1  // 1-indexed for easier human readability
      }));
      
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
        // Prefer explicit hasTime boolean from AI
        if (typeof entry.hasTime === 'boolean') {
          return entry.hasTime;
        }
        // Fallback: regex-based detection from time field
        const timeStr = String(entry.time || "").trim();
        if (timeStr === "" || timeStr === "-" || timeStr === "--" || 
            timeStr.toLowerCase() === "n/a" || timeStr.toLowerCase() === "na" ||
            timeStr.toLowerCase() === "null" || timeStr === "0") {
          return false;
        }
        return TIME_REGEX.test(timeStr);
      };
      
      // Helper function to normalize entries for comparison (sort by medicationId, date, timeSlot, code)
      // IMPORTANT: Includes hasTime for PRN refusal consensus
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
      // Note: hasTime is explicitly included for PRN refusal consensus
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
      
      // Helper function to deduplicate entries
      const deduplicateEntries = (entries: any[]): any[] => {
        const seenKeys = new Set<string>();
        return entries.filter((entry: any) => {
          const key = `${entry.medicationId}-${entry.date}-${entry.timeSlot}`;
          if (seenKeys.has(key)) {
            return false;
          }
          seenKeys.add(key);
          return true;
        });
      };
      
      // Function to run one complete extraction pass using text extraction
      const runExtractionPass = async (passNumber: number): Promise<any[]> => {
        console.log(`DEBUG: Starting text extraction pass ${passNumber}`);
        
        const batchPromises = medicationBatches.map(async (batch, batchIndex) => {
          const batchMedList = batch.map((m: any) => 
            `[ID:${m.medicationId}] ${m.name}${m.isPRN ? ' (PRN)' : ''}`
          ).join("\n");
          
          const batchPrompt = `You are an EMAR data extractor analyzing EMAR document text. Extract administration records ONLY for these specific medications:

MEDICATIONS TO FIND (use exact medicationId in output):
${batchMedList}

DATES FROM DOCUMENT: ${metadata.dates?.join(", ")}
TIME SLOTS: ${metadata.timeSlots?.join(", ")}

ANALYZE THE DOCUMENT TEXT:
1. Find all entries for the medication(s) listed above
2. Extract the care worker initials (typically 2 letters)
3. Identify administration codes and times

Return JSON with entries ONLY for the medications listed above:
{
  "entries": [
    {"medicationId": ${batch[0].medicationId}, "date": "Sat, 06 Dec", "timeSlot": "08:00-09:00", "code": "AD", "careWorkerInitials": "RK", "time": "08:30", "hasTime": true}
  ]
}

CODES TO LOOK FOR (be thorough - don't miss any):
- AD (administered), AS (assisted), P (prompted) - regular medications
- PRN (given as needed) - PRN medications when given/administered
- R (refused) - medication was refused by service user - VERY IMPORTANT TO CAPTURE
- MU (medication unavailable), NH (not home)
- SA (self-administered), FA (family administered)
- MISSED - for missed doses

CRITICAL: FOR EVERY ENTRY YOU MUST INCLUDE "hasTime" BOOLEAN:
- hasTime: true = a specific time is recorded in the document (e.g., "08:30", "14:15")
- hasTime: false = NO time is recorded, just initials or code present

PRN MEDICATION TIME DETECTION (CRITICAL FOR REFUSALS):
- Look carefully at each PRN row in the document
- If there is a TIME value recorded (like 08:30, 2:15pm) -> hasTime: true
- If there is NO time, just initials or blank -> hasTime: false
- This is used to detect PRN refusals so BE ACCURATE about hasTime

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
4. Skip only truly blank/empty cells - but capture ALL cells with any code or initials`;
          
          try {
            const response = await createChatCompletion({
              model: "gpt-5.1",
              messages: [
                { role: "system", content: batchPrompt },
                { role: "user", content: `Extract medication entries from this document:\n\n${analysisText}` }
              ],
              max_completion_tokens: 8000,
              temperature: 0,
              seed: DETERMINISTIC_SEED,
              response_format: { type: "json_object" },
            });
            
            const content = response.choices[0]?.message?.content || '{"entries":[]}';
            const data = JSON.parse(content);
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
      console.log("DEBUG: Running 3-pass parallel text extraction");
      sendProgress(35, "Extracting medication records...", "extraction_running");
      
      // Run 3 extraction passes in parallel
      const [pass1Entries, pass2Entries, pass3Entries] = await Promise.all([
        runExtractionPass(1),
        runExtractionPass(2),
        runExtractionPass(3)
      ]);
      
      let extractedEntries: any[] = pass1Entries;
      let consensusStatus: "single_pass" | "verified" | "no_consensus" = "single_pass";
      let consensusDetails: { 
        pass1Count: number; 
        pass2Count?: number; 
        pass3Count?: number; 
        matchingPasses: number[];
        fallbackPassUsed?: number;
        escalationReason?: string;
      } = { 
        pass1Count: pass1Entries.length,
        pass2Count: pass2Entries.length,
        pass3Count: pass3Entries.length,
        matchingPasses: [] // Will be populated based on actual consensus
      };
      
      console.log(`DEBUG: Pass counts - P1: ${pass1Entries.length}, P2: ${pass2Entries.length}, P3: ${pass3Entries.length}`);
      
      // =====================================================================
      // VALIDATED 3-PASS APPROACH: Use per-entry consensus
      // Validates entries against domain constraints to prevent hallucinated data
      // =====================================================================
      
      // Domain constraints for validation
      const validMedicationIds = new Set(medicationsWithIds.map((m: any) => m.medicationId));
      const validCodes = new Set(["AD", "AS", "P", "PRN", "PRN-R", "R", "MU", "NH", "SA", "FA", "MISSED"]);
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
          
          // Domain constraint checks
          if (!validMedicationIds.has(e.medicationId)) return false;
          if (!validCodes.has(e.code.toUpperCase())) return false;
          
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
      
      // Validate all 3 passes
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
            entryPassVotes.set(hash, { passIds: new Set(), entry: entry });
          }
          entryPassVotes.get(hash)!.passIds.add(passData.passNum);
        }
      }
      
      const consensusEntries: any[] = [];
      const singlePassEntries: any[] = [];
      
      entryPassVotes.forEach(({ passIds, entry }, hash) => {
        if (passIds.size >= 2) {
          // Entry found in 2+ passes = consensus
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
      sendProgress(65, "Extraction complete...", "extraction_complete");
      
      console.log(`DEBUG: Extraction result: ${consensusStatus}, using ${extractedEntries.length} entries`);
      
      // =====================================================================
      // POST-PROCESSING: Convert PRN entries without times to PRN-R (refused)
      // In EMAR systems, PRN without time = PRN refused (shown in red)
      // Uses computeHasTime() which was already applied during normalization
      // =====================================================================
      
      let prnRefusalCount = 0;
      extractedEntries = extractedEntries.map((entry: any) => {
        const code = (entry.code || "").toUpperCase();
        const isPrnMed = medicationsWithIds.some((m: any) => 
          m.medicationId === entry.medicationId && m.isPRN === true
        );
        
        // Use computeHasTime for deterministic detection (same logic used in consensus)
        const hasTime = computeHasTime(entry);
        
        // If this is a PRN medication entry with code "PRN" but no time, it's a refusal
        if (isPrnMed && code === "PRN" && !hasTime) {
          prnRefusalCount++;
          console.log(`DEBUG: PRN->PRN-R conversion: medId=${entry.medicationId}, date=${entry.date}, timeSlot=${entry.timeSlot}, hasTime=${hasTime}, time="${entry.time}"`);
          return { ...entry, code: "PRN-R", hasTime: false };
        }
        return entry;
      });
      
      if (prnRefusalCount > 0) {
        console.log(`DEBUG: Converted ${prnRefusalCount} PRN entries without times to PRN-R (refused)`);
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

      // Calculate expected total cells (for non-PRN medications)
      const nonPrnMedsList = metadata.medications?.filter((m: any) => !m.isPRN) || [];
      const prnMedsList = metadata.medications?.filter((m: any) => m.isPRN) || [];
      const expectedNonPrnEntries = nonPrnMedsList.length * (metadata.dates?.length || 0) * (metadata.timeSlots?.length || 0);
      const actualEntriesCount = extractedEntries.length;
      const expectedEntriesCount = expectedNonPrnEntries; // We only expect entries for non-PRN meds
      
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
      const allEntries = (extractedData.entries || []).map((entry: any) => {
        const initials = (entry.careWorkerInitials || "").toUpperCase();
        let careWorkerValue = initials;
        
        if (initials && initials.length > 0) {
          const fullName = initialsToName.get(initials);
          if (fullName) {
            careWorkerValue = fullName;
          } else {
            // Keep original initials but track as unknown
            unknownInitials.add(initials);
          }
        }
        
        // Resolve medication name from medicationId
        const medId = entry.medicationId || 0;
        const medDetails = medIdToDetails.get(medId);
        const medicationName = medDetails?.name || entry.medication || `Unknown (ID:${medId})`;
        
        return {
          medicationId: medId,
          medication: medicationName,
          date: entry.date || "",
          timeSlot: entry.timeSlot || "",
          time: entry.time || "",
          code: entry.code || "BLANK",
          careWorker: careWorkerValue
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
      
      // Helper to normalize medication names for comparison
      const normalizeMedName = (name: string): string => {
        return (name || "")
          .toLowerCase()
          .trim()
          .replace(/\s+/g, " "); // collapse multiple spaces
      };
      
      // Group medications by normalized name, keeping first occurrence as canonical
      const medByNormalizedName = new Map<string, any>();
      const oldIdToCanonicalId = new Map<number, number>();
      
      medications.forEach((med: any) => {
        const normalizedName = normalizeMedName(med.name);
        
        if (!medByNormalizedName.has(normalizedName)) {
          // First occurrence - this becomes the canonical entry
          medByNormalizedName.set(normalizedName, med);
          oldIdToCanonicalId.set(med.medicationId, med.medicationId);
        } else {
          // Duplicate - map old ID to canonical ID
          const canonicalMed = medByNormalizedName.get(normalizedName);
          oldIdToCanonicalId.set(med.medicationId, canonicalMed.medicationId);
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
        code?: string; // Administration code (R, MU, NH, etc.) - used for refusal grouping
        issue: string;
        severity: "high" | "medium" | "low";
        actions: { performanceNote: boolean; meeting: string; referToManager: boolean };
      }

      interface VerificationItem {
        careWorkerName: string;
        date: string;
        medication: string;
        code: string;
        note: string;
      }

      interface Warning {
        type: string;
        severity: "critical" | "high" | "medium" | "low";
        medication: string;
        description: string;
        recommendedAction: string;
      }

      const discrepancies: Discrepancy[] = [];
      const verificationItems: VerificationItem[] = [];
      const warnings: Warning[] = [];
      
      // Build lookup maps
      const prnMeds = new Set<string>();
      const prnMedIds = new Set<number>(); // Track PRN medication IDs
      const medGenericNames = new Map<string, string>();
      const medGapHours = new Map<string, number>();
      const medTimeSlots = new Map<string, string[]>();
      
      medications.forEach((med: any) => {
        if (med.isPRN) {
          prnMeds.add(med.name);
          prnMedIds.add(med.medicationId);
        }
        if (med.genericName) medGenericNames.set(med.name, med.genericName.toLowerCase());
        if (med.requiredGapHours) medGapHours.set(med.name, med.requiredGapHours);
        if (med.timeSlots) medTimeSlots.set(med.name, med.timeSlots);
      });

      // =====================================================================
      // CHECK 1: ALLERGY MATCHING
      // =====================================================================
      const allergyLower = allergies.toLowerCase();
      if (!allergyLower.includes("no known") && !allergyLower.includes("nkda") && allergies.trim() !== "") {
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
          
          warnings.push({
            type: "duplicate_medication_entry",
            severity: "high",
            medication: matchingMeds.join(", "),
            description: `Medication "${baseName}" appears ${count} times with potentially different instructions`,
            recommendedAction: "Review EMAR setup - may indicate system error or prescribing issue"
          });
        }
      });

      // =====================================================================
      // CHECK 3.5: AI-POWERED MEDICATION EQUIVALENCE DETECTION
      // Uses GPT to identify brand/generic name equivalences that weren't caught
      // Example: Oxycodone and Oxypro MR are the same medication
      // =====================================================================
      if (medications.length >= 2) {
        sendProgress(52, "Checking for medication equivalences...", "medication_equivalence_check");
        
        const medNames = medications.map((m: any) => m.name).join(", ");
        
        try {
          const equivalenceResponse = await createChatCompletion({
            model: "gpt-5.1",
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
            max_completion_tokens: 1000,
            temperature: 0,
            response_format: { type: "json_object" }
          });

          const equivalenceContent = equivalenceResponse.choices[0]?.message?.content || "{}";
          const equivalenceData = JSON.parse(equivalenceContent);

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
      // CHECK 6: VALIDATE EXTRACTED ENTRIES (for codes like R, MU, NH, SA)
      // =====================================================================
      allEntries.forEach((entry: any) => {
        const code = (entry.code || "").toUpperCase();
        const careWorker = entry.careWorker || "";
        const date = entry.date || "";
        const timeSlot = entry.timeSlot || "";
        const medication = entry.medication || "";
        const isPRN = prnMeds.has(medication);

        // CHECK 5a: R (Refused) or PRN-R (PRN Refused) - ALWAYS flag as discrepancy
        if (code === "R" || code === "PRN-R") {
          const isPrnRefusal = code === "PRN-R";
          discrepancies.push({
            careWorkerName: careWorker,
            date: date,
            timeSlot: timeSlot,
            medication: medication,
            code: code, // "R" or "PRN-R" for refusal grouping filter
            issue: isPrnRefusal 
              ? "PRN medication refused (PRN-R) - requires documented reason"
              : "Medication refused (R) - requires documented reason",
            severity: "high",
            actions: { performanceNote: true, meeting: "phone", referToManager: false }
          });
          
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            code: code,
            note: isPrnRefusal 
              ? "Check if PRN refusal reason is documented and acceptable"
              : "Check if refusal reason is documented and acceptable"
          });
        }

        // CHECK 5b: MISSED entries (red highlighted blank boxes) - these indicate missed medications
        // Note: White/normal blank boxes are NOT extracted and are NOT discrepancies
        if (code === "MISSED") {
          // This was a red/highlighted blank box indicating a missed medication
          discrepancies.push({
            careWorkerName: "Unknown",
            date: date,
            timeSlot: timeSlot,
            medication: medication,
            issue: "Missed medication - red/highlighted blank box indicates medication was not given",
            severity: "high",
            actions: { performanceNote: true, meeting: "phone", referToManager: true }
          });
        }

        // CHECK 5c: MU, NH, SA require verification
        if (code === "MU") {
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            code: "MU",
            note: "Check if medication unavailability is documented and escalated"
          });
        }

        if (code === "NH") {
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            code: "NH",
            note: "Check if not home status is documented"
          });
        }

        if (code === "SA") {
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            code: "SA",
            note: "Check if self-administration was appropriate and witnessed"
          });
        }

        if (code === "FA") {
          verificationItems.push({
            careWorkerName: careWorker,
            date: date,
            medication: medication,
            code: "FA",
            note: "Check if family administration is documented and appropriate"
          });
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
        // First check explicit time field
        let timeStr = (entry.time || "").trim();
        if (timeStr && timeStr.includes(":")) {
          return timeStr;
        }
        
        // Also check if timeSlot contains a time (e.g., "08:00", "14:30")
        const slotStr = (entry.timeSlot || "").trim();
        const timeMatch = slotStr.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
          return timeMatch[1];
        }
        
        // Check for common time slot names and convert to approximate times
        const slotLower = slotStr.toLowerCase();
        if (slotLower.includes("morning") || slotLower === "am") return "08:00";
        if (slotLower.includes("lunch") || slotLower.includes("noon")) return "12:00";
        if (slotLower.includes("afternoon")) return "14:00";
        if (slotLower.includes("evening") || slotLower.includes("tea")) return "18:00";
        if (slotLower.includes("night") || slotLower.includes("bed")) return "22:00";
        
        return null;
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
        
        const isPRN = prnMeds.has(entry.medication) || code.includes("PRN");
        const key = `${entry.medication}|${canonicalDateKey}`;
        
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
        
        const [medication, dateKey] = key.split("|");
        // Use configured gap if available, otherwise 4 hours for PRN, 4 hours for regular meds
        const requiredGap = medGapHours.get(medication) || 4; // Default 4 hours minimum between doses
        
        // Verify all entries have the same original date (prevent cross-day false positives)
        const uniqueDates = new Set(dayEntries.map((e: any) => e.originalDate));
        if (uniqueDates.size > 1) {
          console.log(`DEBUG: WARNING - Multiple dates found in same group for ${medication}: ${Array.from(uniqueDates).join(", ")}`);
          // Don't compare entries from different days
          return;
        }
        
        console.log(`DEBUG: Checking time gaps for ${medication} on "${dateKey}": ${dayEntries.length} entries, required gap: ${requiredGap}h`);
        
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
      const muCounts = new Map<string, number>();
      allEntries.forEach((entry: any) => {
        if ((entry.code || "").toUpperCase() === "MU") {
          muCounts.set(entry.medication, (muCounts.get(entry.medication) || 0) + 1);
        }
      });

      muCounts.forEach((count, med) => {
        if (count >= 3) {
          warnings.push({
            type: "medication_unavailable_pattern",
            severity: "medium",
            medication: med,
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
      
      if (discrepancies.length > 0) {
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
          // Use GPT-5.1 with JSON mode for reliable parsing
          const pass2Response = await createChatCompletion({
            model: "gpt-5.1",
            messages: [
              { role: "system", content: pass2SystemPrompt },
              { role: "user", content: hasTextContext 
                ? "Review the discrepancies. Be conservative - when in doubt, keep the discrepancy."
                : [...imageContent, { type: "text", text: "Review the discrepancies based on these EMAR images. Be conservative - when in doubt, keep the discrepancy." }]
              }
            ],
            max_completion_tokens: 2000,
            temperature: 0,
            response_format: { type: "json_object" },
          });
          
          const pass2Content = pass2Response.choices[0]?.message?.content || "{}";
          
          try {
            const pass2Data = JSON.parse(pass2Content);
            const validIndices = pass2Data.validIndices;
            
            // Only filter if we got a valid array with at least some indices
            if (Array.isArray(validIndices) && validIndices.length > 0) {
              const validSet = new Set(validIndices);
              validatedDiscrepancies = discrepancies.filter((_, i) => validSet.has(i + 1));
              pass2Success = true;
              console.log(`DEBUG: Pass 2 validation - ${discrepancies.length} -> ${validatedDiscrepancies.length} discrepancies`);
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
            // Use GPT-5.1 with JSON mode for reliable parsing
            const pass3Response = await createChatCompletion({
              model: "gpt-5.1",
              messages: [
                { role: "system", content: pass3SystemPrompt },
                { role: "user", content: hasTextContext
                  ? "Confirm discrepancies and provide evidence where possible. Keep discrepancies even without explicit text evidence."
                  : [...imageContent, { type: "text", text: "Confirm discrepancies based on these EMAR images. Provide evidence where visible. Keep discrepancies even without clear visual evidence." }]
                }
              ],
              max_completion_tokens: 2000,
              temperature: 0,
              response_format: { type: "json_object" },
            });
            
            const pass3Content = pass3Response.choices[0]?.message?.content || "{}";
            
            try {
              const pass3Data = JSON.parse(pass3Content);
              const confirmedIndices = pass3Data.confirmedIndices;
              
              // Only filter if we got valid indices; otherwise keep all
              if (Array.isArray(confirmedIndices) && confirmedIndices.length > 0) {
                const confirmedSet = new Set(confirmedIndices);
                const beforeCount = validatedDiscrepancies.length;
                validatedDiscrepancies = validatedDiscrepancies.filter((_, i) => confirmedSet.has(i + 1));
                
                // Store evidence for confirmed discrepancies
                if (pass3Data.evidence) {
                  validationEvidence = pass3Data.evidence;
                }
                
                validationStatus = "completed";
                console.log(`DEBUG: Pass 3 confirmation - ${beforeCount} -> ${validatedDiscrepancies.length} discrepancies`);
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
      }
      
      console.log(`DEBUG: Triple-check complete - ${originalCount} initial -> ${validatedDiscrepancies.length} confirmed (status: ${validationStatus})`);
      sendProgress(95, "Generating report...", "report_generation");

      // =====================================================================
      // GROUP REFUSAL DISCREPANCIES INTO MAIN AND PRN CATEGORIES
      // Main Refusals: R, MU, NH, FA, SA codes (non-PRN refusal-related codes)
      // PRN Refusals: PRN-R codes only
      // Other discrepancies: everything else
      // =====================================================================
      const mainRefusalDiscrepancies: any[] = [];
      const prnRefusalDiscrepancies: any[] = [];
      const otherDiscrepancies: any[] = [];
      
      validatedDiscrepancies.forEach((d: any) => {
        const code = (d.code || "").toUpperCase();
        
        // Main refusal codes: R, MU, NH, FA, SA
        const isMainRefusalCode = code === "R" || code === "MU" || code === "NH" || code === "FA" || code === "SA";
        // PRN refusal code: PRN-R only
        const isPrnRefusalCode = code === "PRN-R";
        
        if (isPrnRefusalCode) {
          prnRefusalDiscrepancies.push(d);
        } else if (isMainRefusalCode) {
          mainRefusalDiscrepancies.push(d);
        } else {
          otherDiscrepancies.push(d);
        }
      });

      // Group main refusals by care worker + medication
      const mainRefusalGroups = new Map<string, {
        careWorkerName: string;
        medication: string;
        code: string;
        dates: { date: string; timeSlot: string; code: string }[];
        count: number;
      }>();

      mainRefusalDiscrepancies.forEach((d: any) => {
        const key = `${d.careWorkerName}|${d.medication}`;
        if (!mainRefusalGroups.has(key)) {
          mainRefusalGroups.set(key, {
            careWorkerName: d.careWorkerName,
            medication: d.medication,
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
        code: string;
        dates: { date: string; timeSlot: string; code: string }[];
        count: number;
      }>();

      prnRefusalDiscrepancies.forEach((d: any) => {
        const key = `${d.careWorkerName}|${d.medication}`;
        if (!prnRefusalGroups.has(key)) {
          prnRefusalGroups.set(key, {
            careWorkerName: d.careWorkerName,
            medication: d.medication,
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

      // =====================================================================
      // BUILD RESPONSE
      // =====================================================================
      const result = {
        serviceUserName: extractedData.serviceUserInitials || "Unknown",
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
          hasPRN: prnMeds.size > 0,
          medications: medications.filter((m: any) => m.isPRN).map((m: any) => ({
            name: m.name,
            protocol: "PRN protocol should be in place"
          }))
        },
        totalEntriesProcessed: allEntries.length,
        totalMedications: medications.length,
        datesAudited: allDates,
        timeSlotsFound: timeSlots,
        extractionMethod: "vision-api",
        validationPasses: 3,
        validationStatus: validationStatus,
        validationEvidence: validationEvidence,
        initialDiscrepancyCount: originalCount,
        themesAndTrends: `Processed ${allEntries.length} entries across ${medications.length} medications for ${allDates.length} days. 3-pass Vision consensus validation: ${originalCount} initial findings -> ${validatedDiscrepancies.length} confirmed discrepancies, ${verificationItems.length} items requiring verification, and ${warnings.length} warnings.`,
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
          description: consensusStatus === "verified"
            ? `Extraction verified - passes ${consensusDetails.matchingPasses.join(", ")} agreed`
            : `No consensus - using pass ${consensusDetails.fallbackPassUsed} with highest count for safety`
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
    } catch (error: any) {
      console.error("EMAR AI Error:", error);
      sendEvent('error', { message: error.message || "AI analysis failed" });
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
    }
  });

  // Analyze Visit Notes with SSE streaming progress
  app.post("/api/ai/analyze-visit", requireAuth, async (req, res) => {
    const { documentContent } = req.body;
    
    if (!documentContent) {
      return res.status(400).json({ message: "Document content required" });
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
      sendProgress(5, "Loading policies...", "init");
      
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
      
      sendProgress(30, "Running AI analysis...", "ai_analysis");
      
      const response = await createChatCompletion({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these visit logs:\n\n${documentContent}` }
        ],
        max_completion_tokens: 4000,
        temperature: 0,
        seed: DETERMINISTIC_SEED,
      });

      sendProgress(50, "Processing initial results...", "parsing_results");

      const content = response.choices[0]?.message?.content || "";
      
      // Try to parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        // Filter out any discrepancies with invalid care worker names
        if (result.discrepancies && Array.isArray(result.discrepancies)) {
          result.discrepancies = result.discrepancies.filter((d: any) => {
            const name = d.careWorkerName?.toLowerCase?.() || '';
            return name && name !== 'n/a' && name !== 'unknown' && name !== 'not applicable' && name.trim() !== '';
          });
        }
        
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
          const docContext = documentContent.substring(0, 30000);
          
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
            // Use GPT-5.1 for deterministic validation
            const pass2Response = await createChatCompletion({
              model: "gpt-5.1",
              messages: [
                { role: "system", content: pass2Prompt },
                { role: "user", content: "Review discrepancies. Be conservative - when in doubt, keep." }
              ],
              max_completion_tokens: 2000,
              temperature: 0,
              seed: DETERMINISTIC_SEED,
            });
            
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
              // Use GPT-5.1 for deterministic validation
              const pass3Response = await createChatCompletion({
                model: "gpt-5.1",
                messages: [
                  { role: "system", content: pass3Prompt },
                  { role: "user", content: "Confirm and provide evidence. Keep discrepancies even without explicit text." }
                ],
                max_completion_tokens: 2000,
                temperature: 0,
                seed: DETERMINISTIC_SEED,
              });
              
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
      } else {
        sendEvent('error', { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error: any) {
      console.error("Visit AI Error:", error);
      sendEvent('error', { message: error.message || "AI analysis failed" });
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
    }
  });

  // Analyze documents for risk assessment
  app.post("/api/ai/analyze-risks", requireAuth, async (req, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    
    try {
      const { documentContent } = req.body;
      
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

      const systemPrompt = `You are an expert care assessor for a UK care facility. Analyze the uploaded documents to identify service user information and determine which risk assessments are needed.
${policyContext}
FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (—) or en-dashes (–). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

IMPORTANT RULES:
1. ONLY use information explicitly stated in the documents. Never make assumptions.
2. If you cannot find specific information, state "Information not found in documents"
3. Be very careful to extract the correct service user details

EXTRACT FROM DOCUMENTS:
- Service user initials ONLY (format: "F.O." - first letter of first name + "." + first letter of last name + ".")
- Medical conditions mentioned (diabetes, epilepsy, strokes, dementia, etc.)
- Care activities we assist with (feeding, medication, mobility, personal care, etc.)
- Any concerns mentioned (falls history, skin issues, behavioral concerns, etc.)

PRIVACY REQUIREMENT:
- NEVER include full names or dates of birth
- Extract ONLY initials in format "F.O." (first initial + dot + last initial + dot)
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

      const response = await createChatCompletion({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these documents for risk assessment needs:\n\n${documentContent}` }
        ],
        max_completion_tokens: 4000,
      });

      clearInterval(progressInterval);
      sendProgress(80, "Processing results...", "processing");

      const content = response.choices[0]?.message?.content || "";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let result = JSON.parse(jsonMatch[0]);
        // Apply PII scrubbing - normalize initials and remove any DOBs
        if (result.serviceUser) {
          result.serviceUser.initials = normalizeInitials(result.serviceUser.initials);
        }
        result = scrubPII(result);
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', result);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        sendEvent('error', { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
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
  app.post("/api/ai/generate-risk-assessment", requireAuth, async (req, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    
    try {
      const { documentContent, assessmentCategory, serviceUserInitials, performedBy, performedByJobTitle } = req.body;
      
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

      const systemPrompt = `You are an expert care risk assessor for a UK care facility. Generate a detailed risk assessment for the specified category.

FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (—) or en-dashes (–). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

IMPORTANT RULES:
1. ONLY use information explicitly stated in the documents provided
2. If something isn't in the documents, say "I'm not aware of this information based on the documents provided"
3. Use professional but clear language suitable for care documentation
4. Follow CQC (Care Quality Commission) standards

SERVICE USER DETAILS:
- Service User Initials: ${serviceUserInitials || 'N.N.'}

PRIVACY REQUIREMENT: Never include full names or dates of birth. Use only initials.

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

      const response = await createChatCompletion({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a ${assessmentCategory} risk assessment based on these documents:\n\n${documentContent}` }
        ],
        temperature: 0,
        seed: 42,
        max_completion_tokens: 4000,
      });

      sendProgress(70, "Processing results...", "processing");

      const content = response.choices[0]?.message?.content || "";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let result = JSON.parse(jsonMatch[0]);
        
        // Preserve fields that should NOT be scrubbed (they contain expected values)
        const preservedFields = {
          assessmentDate: result.assessmentDate,
          signedBy: result.signedBy || performedBy || 'Staff member',
          jobTitle: result.jobTitle || performedByJobTitle || 'Care Staff',
          category: result.category,
        };
        
        // Apply PII scrubbing to the rest (risks, notes, etc.)
        result.serviceUserInitials = normalizeInitials(result.serviceUserInitials);
        result = scrubPII(result);
        
        // Restore preserved fields (override any scrubbed values)
        result.assessmentDate = preservedFields.assessmentDate;
        result.signedBy = preservedFields.signedBy;
        result.jobTitle = preservedFields.jobTitle;
        result.category = preservedFields.category;
        
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', result);
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
  app.post("/api/ai/generate-care-plan", requireAuth, async (req, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    
    try {
      const { documentContent, serviceUserInitials } = req.body;
      
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

      const baseSystemPrompt = `You are an expert care plan writer for a UK care facility following CQC standards.
${policyContext}
RULES:
- Write EVERYTHING in FIRST PERSON from the service user's perspective using "I", "my", "me".
- CORRECT: "I need two carers to help me transfer." WRONG: "The client needs..."
- Never use m-dashes or en-dashes. Use hyphens or commas.
- Never use Oxford commas.
- Be detailed and specific with times, preferences, routines.
- Only include information found in the documents. If no info, say "Please ask me about my preferences."

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

      const completedSections: any[] = [];
      let emergencyContacts = "Not found in documents";
      let gpDetails = "Not found in documents";
      let additionalNotes = "No additional notes";

      // Generate each section individually
      for (let i = 0; i < mandatorySections.length; i++) {
        const section = mandatorySections[i];
        const progressPercent = 10 + Math.round((i / mandatorySections.length) * 80);
        
        sendProgress(progressPercent, `Generating: ${section.title}...`, "generating");
        console.log(`[CarePlan] Generating section ${i + 1}/${mandatorySections.length}: ${section.title}`);

        try {
          const sectionResponse = await createChatCompletion({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: baseSystemPrompt },
              { role: "user", content: `Generate the "${section.title}" section (priority: ${section.priority}).

FOCUS ON: ${section.focus}

Service user documents:
${documentContent}

Remember: Write as if I am the service user speaking about my own needs. Return ONLY valid JSON.` }
            ],
            temperature: 0.3,
            max_completion_tokens: 1500,
          });

          const sectionContent = sectionResponse.choices[0]?.message?.content || "";
          const jsonMatch = sectionContent.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            let enhancedContent = parsed.content || "";
            
            // Ensure first-person perspective
            if (!enhancedContent.includes("I ") && !enhancedContent.includes("my ")) {
              enhancedContent = enhancedContent.replace(/The (client|service user|patient)/gi, "I");
              enhancedContent = enhancedContent.replace(/Staff should/gi, "I need my carers to");
            }
            
            const completedSection = {
              title: section.title,
              priority: section.priority,
              content: scrubPII(enhancedContent),
              steps: (Array.isArray(parsed.steps) && parsed.steps.length > 0 
                ? parsed.steps 
                : ["Please refer to my preferences above", "Check my care notes", "Ask me if unsure"])
                .map((s: any) => typeof s === 'string' ? scrubPII(s) : String(s)),
              risks: (Array.isArray(parsed.risks) ? parsed.risks : [])
                .map((r: any) => typeof r === 'string' ? scrubPII(r) : String(r)),
              equipment: (Array.isArray(parsed.equipment) ? parsed.equipment : [])
                .map((e: any) => typeof e === 'string' ? scrubPII(e) : String(e)),
            };
            
            completedSections.push(completedSection);
            
            // Send this section immediately to the frontend
            sendEvent('section', { index: i, section: completedSection });
            
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
            sendEvent('section', { index: i, section: fallbackSection });
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
          sendEvent('section', { index: i, section: fallbackSection });
        }
      }

      // Extract emergency contacts and GP details from first successful section response
      try {
        const metaResponse = await createChatCompletion({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Extract contact information from the documents. Return JSON only." },
            { role: "user", content: `From these documents, extract:
1. Emergency contacts (names, relationships, phone numbers)
2. GP details (name, surgery, phone)
3. Any additional important notes

Documents:
${documentContent.substring(0, 3000)}

Return JSON: {"emergencyContacts": "...", "gpDetails": "...", "additionalNotes": "..."}` }
          ],
          temperature: 0,
          max_completion_tokens: 500,
        });
        
        const metaContent = metaResponse.choices[0]?.message?.content || "";
        const metaMatch = metaContent.match(/\{[\s\S]*\}/);
        if (metaMatch) {
          const meta = JSON.parse(metaMatch[0]);
          // Ensure all fields are strings, not objects
          const extractedEmergency = meta.emergencyContacts || emergencyContacts;
          const extractedGp = meta.gpDetails || gpDetails;
          const extractedNotes = meta.additionalNotes || additionalNotes;
          
          // Convert objects to strings if needed
          const emergencyStr = typeof extractedEmergency === 'string' ? extractedEmergency : 
                               extractedEmergency ? JSON.stringify(extractedEmergency) : emergencyContacts;
          const gpStr = typeof extractedGp === 'string' ? extractedGp : 
                        extractedGp ? JSON.stringify(extractedGp) : gpDetails;
          const notesStr = typeof extractedNotes === 'string' ? extractedNotes : 
                           extractedNotes ? JSON.stringify(extractedNotes) : additionalNotes;
          
          emergencyContacts = scrubPII(emergencyStr);
          gpDetails = scrubPII(gpStr);
          additionalNotes = scrubPII(notesStr);
        }
      } catch (e) {
        console.log("[CarePlan] Could not extract meta info, using defaults");
      }

      // Build final result - ensure all fields are correct types
      const result = {
        serviceUserInitials: normalizeInitials(serviceUserInitials || 'N.N.'),
        generatedDate: today,
        sections: Array.isArray(completedSections) ? completedSections.filter((s): s is any => s != null && typeof s === 'object') : [],
        emergencyContacts: String(emergencyContacts || ""),
        gpDetails: String(gpDetails || ""),
        additionalNotes: String(additionalNotes || ""),
      };

      sendProgress(100, "Complete!", "complete");
      sendEvent('result', result);
      
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
  app.post("/api/ai/enhance-plan", requireAuth, async (req, res) => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let progressInterval: NodeJS.Timeout | null = null;
    
    try {
      const { documentContent, existingPlanContent } = req.body;
      
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
      const contentToEnhance = typeof rawContent === 'string' ? scrubPII(rawContent) : rawContent;

      const systemPrompt = `You are an expert care plan writer for a UK care facility following CQC standards.
Analyze the uploaded documents and generate content for a COMPLETE Initial Assessment/Care Plan template.

PRIVACY RULES - CRITICAL:
- Replace any service user names with "I" (first person perspective)
- NEVER include dates of birth
- Use initials format "F.O." if referring to the service user by name

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

      const response = await createChatCompletion({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this document and generate a complete care plan template. Extract all relevant information and write detailed first-person content for each section:\n\n${contentToEnhance}` }
        ],
        temperature: 0,
        seed: 42,
        max_completion_tokens: 12000,
      });

      clearInterval(progressInterval);
      sendProgress(75, "Processing results...", "processing");

      const content = response.choices[0]?.message?.content || "";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        // Apply PII scrubbing
        const scrubbedResult = scrubPII(result);
        
        sendProgress(100, "Complete!", "complete");
        sendEvent('result', scrubbedResult);
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
  app.post("/api/ai/rewrite-email", requireAuth, async (req, res) => {
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

      const response = await createChatCompletion({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: inputText }
        ],
        max_completion_tokens: 1000,
      });

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
  app.post("/api/ai/generate-prn-protocol", requireAuth, async (req, res) => {
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

      const response = await createChatCompletion({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        return res.status(500).json({ message: "Failed to generate PRN protocol" });
      }

      try {
        const protocol = JSON.parse(content);
        return res.json({ protocol });
      } catch (parseError) {
        console.error("Failed to parse PRN protocol response:", parseError);
        return res.status(500).json({ message: "Failed to parse generated protocol" });
      }
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

  return httpServer;
}
