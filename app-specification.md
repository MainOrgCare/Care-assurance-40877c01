# CareAssurance - Complete Application Specification

> **Purpose**: This document provides a comprehensive technical specification for recreating the CareAssurance healthcare compliance management application. It covers architecture, database schema, API endpoints, AI integration, authentication, and all features in detail.

---

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Authentication & Security](#authentication--security)
6. [API Endpoints](#api-endpoints)
7. [AI Integration](#ai-integration)
8. [Core Features](#core-features)
9. [Frontend Architecture](#frontend-architecture)
10. [Configuration & Environment](#configuration--environment)
11. [Deployment](#deployment)

---

## Overview

CareAssurance is an AI-powered healthcare compliance management application designed for UK care facilities. It automates:

- **EMAR (Electronic Medication Administration Record) Analysis**: AI-powered extraction and auditing of medication records from PDF/Word documents
- **Care Plan Generation**: AI-assisted care plan creation across 11 sections
- **Risk Assessment**: Automated risk assessment recommendations based on service user profiles
- **Care Worker Performance Tracking**: Discrepancy logging and performance monitoring
- **Call Reconciliation**: Excel processing for ECM call data with variation code mapping

### Key Principles

1. **Privacy First**: Only service user initials stored, PII scrubbing on all text, no full names or DOBs
2. **Cost Optimization**: Tiered AI model approach - GPT-4.1-mini for accuracy-critical tasks, GPT-4.1-mini for auxiliary tasks
3. **Real-time Processing**: Server-Sent Events (SSE) for streaming AI responses
4. **Role-based Access**: Admin and Staff roles with approval workflow
5. **Demo Mode**: Read-only exploration without registration

---

## Technology Stack

### Frontend

```
Framework:        React 18 with TypeScript
Routing:          Wouter (lightweight alternative to React Router)
State Management: TanStack React Query v5 (server state)
                  React Context (local state)
UI Components:    shadcn/ui built on Radix UI primitives
Styling:          Tailwind CSS v4 with custom dark theme
Build Tool:       Vite
Icons:            Lucide React
```

### Backend

```
Runtime:          Node.js
Framework:        Express.js
Language:         TypeScript (ES modules)
Database:         PostgreSQL (Neon-backed)
ORM:              Drizzle ORM with drizzle-zod validation
Session Store:    connect-pg-simple (PostgreSQL-backed sessions)
File Upload:      Multer (memory storage)
Password Hashing: bcrypt (10 salt rounds)
WebSocket:        ws library for real-time notifications
```

### AI/External APIs

```
Primary AI:       OpenAI API (direct)
Models Used:      GPT-4.1-mini (core extraction), GPT-4.1-mini (auxiliary tasks)
Virus Scanning:   Cloudmersive Virus Scan API
```

### Key Dependencies

```json
{
  "express": "^4.x",
  "express-session": "^1.x",
  "connect-pg-simple": "^9.x",
  "drizzle-orm": "^0.x",
  "drizzle-zod": "^0.x",
  "openai": "^4.x",
  "bcrypt": "^5.x",
  "multer": "^1.x",
  "ws": "^8.x",
  "xlsx": "^0.x",
  "pdf-parse": "^1.x",
  "mammoth": "^1.x",
  "zod": "^3.x",
  "@tanstack/react-query": "^5.x",
  "wouter": "^3.x",
  "tailwindcss": "^4.x"
}
```

---

## Project Structure

```
/
├── client/                      # Frontend React application
│   └── src/
│       ├── App.tsx              # Main app with routing
│       ├── main.tsx             # Entry point
│       ├── index.css            # Global styles with CSS variables
│       ├── components/          # Reusable components
│       │   ├── ui/              # shadcn/ui components
│       │   ├── Layout.tsx       # Main layout with sidebar
│       │   ├── ProtectedRoute.tsx
│       │   ├── TermsGuard.tsx
│       │   └── ...
│       ├── context/             # React contexts
│       │   ├── AuthContext.tsx  # Authentication state
│       │   ├── SessionContext.tsx # WebSocket session management
│       │   ├── SettingsContext.tsx # Theme/preferences
│       │   └── TemporaryDataContext.tsx # In-memory data sharing
│       ├── pages/               # Page components
│       │   ├── Dashboard.tsx
│       │   ├── Homepage.tsx
│       │   ├── Login.tsx
│       │   ├── SecretAdminPortal.tsx
│       │   ├── CallReconciliation.tsx
│       │   ├── care-workers/
│       │   │   ├── EMARAudit.tsx
│       │   │   ├── CarersList.tsx
│       │   │   ├── Performance.tsx
│       │   │   └── VisitAudit.tsx
│       │   └── service-users/
│       │       ├── Upload.tsx
│       │       ├── CarePlanning.tsx
│       │       ├── RiskAssessment.tsx
│       │       └── PlanEnhancer.tsx
│       ├── hooks/               # Custom hooks
│       │   └── use-toast.ts
│       └── lib/
│           └── queryClient.ts   # TanStack Query setup
│
├── server/                      # Backend Express application
│   ├── index.ts                 # Server entry point
│   ├── routes.ts                # All API routes (~6700 lines)
│   ├── storage.ts               # Database operations (IStorage interface)
│   ├── vite.ts                  # Vite dev server integration
│   ├── config/
│   │   └── aiPricing.ts         # AI model pricing configuration
│   └── services/
│       ├── aiClient.ts          # OpenAI wrapper with failover
│       ├── emarAgent.ts         # EMAR analysis agent (stub)
│       ├── fileScan.ts          # Virus scanning service
│       └── pdfToImages.ts       # PDF to image conversion
│
├── shared/
│   └── schema.ts                # Drizzle schema + Zod validators
│
├── drizzle.config.ts            # Drizzle configuration
├── vite.config.ts               # Vite configuration
├── tailwind.config.ts           # Tailwind configuration
├── tsconfig.json                # TypeScript configuration
└── package.json
```

---

## Database Schema

All tables use UUID primary keys generated with `gen_random_uuid()`.

### Users Table

```typescript
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  password: text("password").notNull(), // bcrypt hashed
  role: text("role").notNull().default("staff"), // 'admin' or 'staff'
  status: text("status").notNull().default("pending"), // 'pending' or 'active'
  jobTitle: text("job_title"),
  suspendedUntil: timestamp("suspended_until"), // Temporary suspension
  lastOnlineAt: timestamp("last_online_at"),
  dashboardWidgets: jsonb("dashboard_widgets"), // Widget order array
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsVersion: text("terms_version"),
  termsSignatureName: text("terms_signature_name"),
  termsSignatureDate: text("terms_signature_date"), // DD/MM/YYYY
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Care Workers Table

```typescript
export const careWorkers = pgTable("care_workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Anonymized format: L.Barron
  role: text("role").notNull(), // 'Care Coordinator', 'Carer', etc.
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Discrepancies Table

```typescript
export const discrepancies = pgTable("discrepancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  careWorkerId: varchar("care_worker_id").notNull().references(() => careWorkers.id),
  type: text("type").notNull(), // 'EMAR' or 'Visit Audit'
  date: text("date").notNull(), // Format: DD/MMM/YYYY
  description: text("description").notNull(),
  action: text("action").notNull(), // 'Office Discussion', 'Performance Note', etc.
  severity: text("severity"), // 'low', 'medium', 'high'
  actionMedium: text("action_medium"), // 'meeting', 'phone', 'video', 'manager'
  manager: text("manager"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Audits Table

```typescript
export const audits = pgTable("audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceUserName: text("service_user_name").notNull(), // Anonymized: K.Spencer
  auditor: text("auditor").notNull(),
  auditType: text("audit_type").notNull(), // 'EMAR' or 'Visit'
  periodStart: text("period_start").notNull(), // DD/MMM/YYYY
  periodEnd: text("period_end").notNull(),
  results: jsonb("results").notNull(), // Full audit data as JSON
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Active Sessions Table

```typescript
export const activeSessions = pgTable("active_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  username: text("username").notNull(),
  role: text("role").notNull(),
  sessionId: text("session_id").notNull(),
  ipAddress: text("ip_address"),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Admin Alerts Table

```typescript
export const adminAlerts = pgTable("admin_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  careWorkerId: varchar("care_worker_id").notNull().references(() => careWorkers.id),
  careWorkerName: text("care_worker_name").notNull(),
  message: text("message").notNull(),
  discrepancyType: text("discrepancy_type").notNull(),
  discrepancyCount: integer("discrepancy_count").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Blocked IPs Table

```typescript
export const blockedIps = pgTable("blocked_ips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: text("ip_address").notNull().unique(),
  blockedBy: text("blocked_by").notNull(),
  reason: text("reason"),
  username: text("username"), // Username that was using this IP
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### EMAR Refusal Reviews Table

```typescript
export const emarRefusalReviews = pgTable("emar_refusal_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: varchar("audit_id"),
  careWorkerName: text("care_worker_name").notNull(),
  medication: text("medication").notNull(),
  refusalDate: text("refusal_date").notNull(),
  timeSlot: text("time_slot"),
  reasonAcceptable: boolean("reason_acceptable").notNull().default(false),
  reviewerNotes: text("reviewer_notes"),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### EMAR Corrections Table

```typescript
export const emarCorrections = pgTable("emar_corrections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: varchar("audit_id"),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  adminUsername: text("admin_username").notNull(),
  serviceUserInitials: text("service_user_initials"),
  originalMedication: text("original_medication").notNull(),
  originalDate: text("original_date").notNull(),
  originalTimeSlot: text("original_time_slot"),
  originalCode: text("original_code"),
  originalCareWorker: text("original_care_worker"),
  correctedMedication: text("corrected_medication"),
  correctedDate: text("corrected_date"),
  correctedTimeSlot: text("corrected_time_slot"),
  correctedCode: text("corrected_code"),
  correctedCareWorker: text("corrected_care_worker"),
  correctionNote: text("correction_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### AI Usage Logs Table

```typescript
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  username: text("username"),
  featureName: text("feature").notNull(),
  model: text("model").notNull(),
  billingSource: text("billing_source").notNull().default("openai"),
  provider: text("provider").notNull().default("openai"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costMicroDollars: integer("cost_micros").notNull().default(0),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### File Scan Logs Table

```typescript
export const fileScanLogs = pgTable("file_scan_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  fileSize: integer("file_size").notNull(),
  scanResult: text("scan_result").notNull(), // 'clean' or 'threat'
  threatsFound: text("threats_found"),
  scannedBy: text("scanned_by"),
  uploadType: text("upload_type"),
  cachedResult: boolean("cached_result").default(false),
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
});
```

### Additional Tables

- `riskAssessmentLogs` - Tracks offered vs selected risk assessments
- `policyDocuments` - Stores policy content for AI reference
- `systemLogs` - General system event logging
- `sessionHistory` - Login/logout history
- `suspensionLogs` - Temporary access revocations

---

## Authentication & Security

### Session Management

```typescript
// PostgreSQL-backed sessions
const PgSession = connectPgSimple(session);
const sessionStore = new PgSession({ pool, createTableIfMissing: true });

const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: true,           // HTTPS only
    httpOnly: true,         // No JS access
    sameSite: "none",       // Cross-origin for iframes
    maxAge: 30 * 60 * 1000, // 30 minutes
    partitioned: true,      // CHIPS for privacy sandbox
  },
  rolling: true, // Reset expiration on each request
});
```

### Authentication Flow

1. **Registration**: User submits form → Account created with `status: "pending"`
2. **Admin Approval**: Admin reviews → Changes status to `active`
3. **Login**: Validates credentials → Creates session + active_sessions record
4. **Session Check**: Every request validates session exists in active_sessions
5. **Terms Acceptance**: First login requires accepting terms with digital signature

### Middleware Functions

```typescript
// Require authenticated user
const requireAuth = async (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
  
  // Handle demo sessions
  if (req.session.isDemo) {
    req.user = { id: req.session.userId, username: "demo_user", role: "staff", isDemo: true };
    return next();
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user || user.status !== "active") return res.status(401).json({ message: "Unauthorized" });
  
  // Check suspension
  if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
    return res.status(403).json({ message: "Account suspended" });
  }
  
  req.user = user;
  next();
};

// Require admin role
const requireAdmin = async (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  next();
};

// Block writes in demo mode
const blockDemoWrites = async (req, res, next) => {
  if (req.user?.isDemo) {
    return res.status(403).json({ message: "Demo mode: Changes are not saved." });
  }
  next();
};
```

### Session Limits

- Maximum 2 non-admin concurrent sessions
- Admin login forces oldest non-admin logout with 30-second warning via WebSocket
- WebSocket path: `/ws?userId={userId}`

### IP Blocking

```typescript
// Check on login
const isBlocked = await storage.isIpBlocked(clientIp);
if (isBlocked) {
  return res.status(403).json({ message: "Access denied. Your IP has been blocked." });
}

// Admin can block IPs from active sessions
app.post("/api/blocked-ips", requireAuth, requireAdmin, ...);
```

### Password Security

- bcrypt with 10 salt rounds
- Minimum 4 character password
- Password change requires current password verification

---

## API Endpoints

### Authentication Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Login with username/password |
| POST | `/api/auth/register` | No | Create pending account |
| GET | `/api/auth/me` | Yes | Get current user |
| POST | `/api/auth/logout` | Yes | Logout and destroy session |
| POST | `/api/auth/accept-terms` | Yes | Accept terms with signature |
| PATCH | `/api/auth/password` | Yes | Change own password |
| PATCH | `/api/auth/profile` | Yes | Update own profile |

### User Management (Admin Only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | Get all users |
| GET | `/api/users/pending` | Get pending users |
| POST | `/api/users` | Create user (immediately active) |
| PATCH | `/api/users/:id/approve` | Approve pending user |
| DELETE | `/api/users/:id` | Delete user |
| PATCH | `/api/users/:id/job-title` | Update job title |
| PATCH | `/api/users/:id/role` | Update role (admin/staff) |
| PUT | `/api/users/:id/username` | Change username |

### Session Management (Admin Only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/active-sessions` | Get all active sessions |
| POST | `/api/sessions/:userId/disconnect` | Force disconnect user |
| GET | `/api/active-sessions/detailed` | Sessions with IP/location |

### Care Workers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/care-workers` | Yes | List all care workers |
| GET | `/api/care-workers/:id` | Yes | Get single care worker |
| POST | `/api/care-workers` | Yes | Create care worker |
| PATCH | `/api/care-workers/:id` | Yes | Update care worker |

### Discrepancies

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/discrepancies` | Yes | Get all discrepancies |
| POST | `/api/discrepancies` | Yes | Create discrepancy |
| GET | `/api/care-workers/:id/discrepancies` | Yes | Get by care worker |

### Audits

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/audits` | Yes | Save audit result |
| GET | `/api/audits` | Yes | Get all audits |
| GET | `/api/audits/:id` | Yes | Get single audit |

### EMAR Analysis

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/analyze-emar` | Yes | Analyze EMAR document (SSE stream) |
| POST | `/api/emar-corrections` | Admin | Save AI extraction corrections |
| POST | `/api/emar-refusal-reviews` | Admin | Review refused medications |
| POST | `/api/emar-refusal-reviews/bulk` | Admin | Bulk review refusals |

### Care Planning

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/parse-pdf` | Yes | Extract text from PDF/DOCX |
| POST | `/api/risk-assessments/analyze` | Yes | AI risk assessment (SSE) |
| POST | `/api/care-plans/enhance` | Yes | AI care plan enhancement (SSE) |
| POST | `/api/prn-protocols/generate` | Yes | Generate PRN protocol (SSE) |

### Admin Portal

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin-alerts` | Admin | Get unread alerts |
| PATCH | `/api/admin-alerts/:id/read` | Admin | Mark alert as read |
| GET | `/api/blocked-ips` | Admin | Get blocked IPs |
| POST | `/api/blocked-ips` | Admin | Block IP address |
| DELETE | `/api/blocked-ips/:id` | Admin | Unblock IP |
| GET | `/api/ai-usage` | Admin | AI usage logs and stats |
| GET | `/api/admin/ai-provider` | Admin | Get AI provider config |
| POST | `/api/admin/ai-provider` | Admin | Set AI provider |

### Call Reconciliation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/reconciliation/analyze` | Admin | Process Excel file |

**Reconciliation Logic:**

- Removes columns: A-E, G-I, K-T, U, V-W, Z-AD, AE, AH-AM, AP-BO, BR-DY, DZ, EA-FW
- Maps cancellation reasons: Hospital→L1, >24hrs→L4, <24hrs/Capacity→L5
- Empty Service Requirement → A1
- Adds "Variation Reason" column
- Returns processed Excel file

### Policy Documents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/policy-documents` | Yes | Get all policies |
| POST | `/api/policy-documents` | Admin | Create policy |
| PUT | `/api/policy-documents/:id` | Admin | Update policy |
| DELETE | `/api/policy-documents/:id` | Admin | Delete policy |

---

## AI Integration

### Tiered Model Approach

```typescript
// Core extraction tasks - accuracy critical
const CORE_MODEL = "gpt-4.1-mini";  // $0.40/1M input, $1.60/1M output

// Auxiliary tasks - cost efficient with temperature support
const AUX_MODEL = "gpt-4.1-mini";  // $0.40/1M input, $1.60/1M output
```

### Model Assignment by Task

| Task | Model | Reason |
|------|-------|--------|
| EMAR metadata extraction | GPT-4.1-mini | 2-pass parallel extraction |
| EMAR entry extraction | GPT-4.1-mini | 3-pass parallel with voting |
| Count validation | GPT-4.1-mini | Simple verification |
| Equivalence checks | GPT-4.1-mini | Pattern matching |
| Drug interactions | GPT-4.1-mini | Lookup-based |
| Validation passes 2/3 | GPT-4.1-mini | Confirmation only |
| Care plan enhancement | GPT-4.1-mini | Quality content |
| Risk assessment | GPT-4.1-mini | Safety critical |
| PRN protocol generation | GPT-4.1-mini | Clinical accuracy |

### AI Client Implementation

```typescript
// server/services/aiClient.ts

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_FALLBACK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_FALLBACK_BASE_URL || "https://api.openai.com/v1",
  });
}

// Provider is fixed to OpenAI for this deployment
let preferredProvider: "openai" = "openai";

async function createChatCompletionWithProvider(params) {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OpenAI is not configured. Set OPENAI_API_KEY or OPENAI_FALLBACK_API_KEY.");
  }
  return { completion: await openai.chat.completions.create(params), provider: "openai" };
}

// Logging wrapper - tracks all AI usage
async function createChatCompletionWithLogging(params, featureName, userContext) {
  const startTime = Date.now();
  const result = await createChatCompletionWithProvider(params);
  const duration = Date.now() - startTime;
  
  // Calculate cost
  const costMicroDollars = calculateCostMicroDollars(
    params.model,
    result.completion.usage?.prompt_tokens || 0,
    result.completion.usage?.completion_tokens || 0
  );
  
  // Log to database
  await storage.createAiUsageLog({
    userId: userContext?.userId,
    username: userContext?.username,
    featureName,
    model: params.model,
    provider: result.provider,
    inputTokens: result.completion.usage?.prompt_tokens || 0,
    outputTokens: result.completion.usage?.completion_tokens || 0,
    totalTokens: result.completion.usage?.total_tokens || 0,
    costMicroDollars,
    durationMs: duration,
  });
  
  return result.completion;
}
```

### AI Pricing Configuration

```typescript
// server/config/aiPricing.ts

export const AI_PRICING = {
  "gpt-4.1-mini": { input: 400, output: 1600 },     // $0.40/$1.60 per 1M
  "gpt-4.1-mini": { input: 400, output: 1600 },  // $0.40/$1.60 per 1M
  "gpt-4o": { input: 2500, output: 10000 },      // $2.50/$10.00 per 1M
  "gpt-4o-mini": { input: 150, output: 600 },    // $0.15/$0.60 per 1M
  // ... more models
};

export function calculateCostMicroDollars(model, inputTokens, outputTokens) {
  const pricing = AI_PRICING[model] || AI_PRICING["default"];
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return Math.round(inputCost + outputCost);
}
```

### Drug Interaction Detection

```typescript
// 24-hour cache to prevent duplicate API calls
const drugInteractionCache = new Map<string, { result: DrugInteraction[]; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function checkDrugInteractions(medications, userContext) {
  const cacheKey = getDrugInteractionCacheKey(medications);
  const cached = drugInteractionCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.result;
  }
  
  const response = await createChatCompletionWithLogging({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `You are a UK pharmacist. Check for dangerous drug interactions...
Return JSON: {"interactions": [{"drug1": "Name1", "drug2": "Name2", "severity": "high|moderate|low", "description": "Brief concern"}]}`
      },
      { role: "user", content: `Check for interactions: ${medList}` }
    ],
    temperature: 0,
    response_format: { type: "json_object" }
  }, "drug_interactions", userContext);
  
  // Cache result
  drugInteractionCache.set(cacheKey, { result: parsed.interactions, timestamp: Date.now() });
  return parsed.interactions;
}
```

### EMAR Analysis System

The EMAR analysis uses a multi-pass approach:

1. **Table Structure Detection**: Analyze document layout (grid vs list format)
2. **Metadata Extraction**: Service user initials, allergies, medication list, date range
3. **Entry Extraction**: Each medication administration with date, time, code, care worker
4. **Validation Passes**: Cross-check extracted data for consistency
5. **Domain Validation**: Medication coverage, date coverage, code distribution
6. **Drug Interaction Check**: Identify high-risk medication combinations

**EMAR Codes:**

- `AD` = Administered
- `R` = Refused (requires admin review)
- `NH` = Not Home
- `SA` = Self Administered
- `F` = Family Administered
- `MU` = Medication Unavailable
- `PRN` = As needed (with additional PRN codes)

### Privacy: PII Scrubbing

```typescript
function scrubPII(data) {
  if (typeof data === 'string') {
    let scrubbed = data;
    
    // Remove DOB patterns
    scrubbed = scrubbed.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, '[REDACTED]');
    
    // Remove "My name is [Name]" patterns
    scrubbed = scrubbed.replace(/\b(my name is|i am called)\s+[A-Z][a-z]+/gi, '$1 [SERVICE USER]');
    
    // Remove full name patterns (except clinical terms)
    scrubbed = scrubbed.replace(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g, (match) => {
      if (isClinicalTerm(match)) return match;
      if (commonPhrases.includes(match.toLowerCase())) return match;
      return '[SERVICE USER]';
    });
    
    return scrubbed;
  }
  // Recursively handle arrays and objects
  // ...
}

// Clinical whitelist
const CLINICAL_WHITELIST = new Set([
  'alzheimer', 'parkinson', 'huntington', 'crohn', 'addison',
  'down syndrome', 'turner syndrome', 'asperger', // ...
]);
```

---

## Core Features

### 1. EMAR Audit

**Upload Flow:**

1. User uploads PDF/DOCX of medication record
2. File scanned for malware (Cloudmersive API)
3. Text extracted (pdf-parse or mammoth)
4. AI analyzes in streaming mode (SSE)
5. Results displayed with discrepancy highlighting

**Discrepancy Types:**

- Missed doses (blank entries)
- Time gaps between administrations
- Refused medications without reason
- Signature inconsistencies
- PRN without documentation

**Admin Review:**

- Review refused medication reasons
- Correct AI extraction errors
- Corrections stored for AI training

### 2. Care Planning

**11 Sections:**

1. Personal Background
2. Communication Needs
3. Physical Health
4. Mental Health & Wellbeing
5. Medication Management
6. Nutrition & Hydration
7. Personal Care & Hygiene
8. Mobility & Transfers
9. Social & Recreational
10. Safety & Risk Management
11. End of Life Preferences

**AI Enhancement:**

- Upload existing care plan
- AI suggests improvements
- Generates missing sections
- UK CQC compliance focus

### 3. Risk Assessment

**Categories:**

- Falls Prevention
- Medication Administration
- Skin Integrity
- Moving & Handling
- Fire Safety
- Lone Working
- Behavior Support
- Dementia Care
- And more...

**AI Analysis:**

- Reads uploaded documents
- Identifies applicable assessments
- Recommends mandatory vs optional
- Logs offered vs selected for audit

### 4. Call Reconciliation

**Excel Processing:**

```typescript
// Columns to DELETE
const columnsToDelete = [
  0-4,    // A-E
  6-8,    // G-I
  10-19,  // K-T
  20,     // U (Service Requirement - after extraction)
  21-22,  // V-W
  25-29,  // Z-AD
  30,     // AE
  33-38,  // AH-AM
  41-66,  // AP-BO
  69-128, // BR-DY
  129,    // DZ (Cancellation Reason - after extraction)
  130-178 // EA-FW
];

// Variation code mapping
function mapCancellationToCode(reason) {
  if (reason.includes("hospital")) return "L1";
  if (reason.includes("capacity")) return "L5";
  if (reason.includes("less than 24")) return "L5";
  if (reason.includes("more than 24")) return "L4";
  return "";
}

// Empty Service Requirement → A1
```

### 5. Performance Tracking

**Metrics:**

- Total discrepancies by type
- Trend over time
- Action outcomes
- Manager referrals

**Alert System:**

- Auto-alert on threshold (3+ EMAR discrepancies)
- Admin notification panel
- Dismissible alerts

---

## Frontend Architecture

### Routing Structure

```typescript
// client/src/App.tsx
<Switch>
  <Route path="/login" component={Login} />
  <Route path="/terms" component={TermsConditions} />
  <Route path="/privacy" component={PrivacyPolicy} />
  
  <ProtectedRoute path="/dashboard" component={Dashboard} />
  
  {/* Service Users */}
  <ProtectedRoute path="/service-users/upload" component={ServiceUserUpload} />
  <ProtectedRoute path="/service-users/care-planning" component={CarePlanning} />
  <ProtectedRoute path="/service-users/risk-assessment" component={RiskAssessment} />
  <ProtectedRoute path="/service-users/plan-enhancer" component={PlanEnhancer} />
  
  {/* Care Workers */}
  <ProtectedRoute path="/care-workers/list" component={CarersList} />
  <ProtectedRoute path="/care-workers/emar-audit" component={EMARAudit} />
  <ProtectedRoute path="/care-workers/visit-audit" component={VisitAudit} />
  <ProtectedRoute path="/care-workers/performance" component={Performance} />
  
  {/* Admin */}
  <ProtectedRoute path="/shadow-admin-portal" component={SecretAdminPortal} />
  <ProtectedRoute path="/call-reconciliation" component={CallReconciliation} />
  <ProtectedRoute path="/compliance" component={Compliance} />
  <ProtectedRoute path="/settings" component={Settings} />
  
  <Route path="/" component={HomeRoute} />
  <Route component={NotFound} />
</Switch>
```

### Context Providers

```typescript
// Wrapper order in App.tsx
<QueryClientProvider client={queryClient}>
  <AuthProvider>           {/* Auth state, login/logout */}
    <SessionProvider>      {/* WebSocket connection */}
      <SettingsProvider>   {/* Theme, preferences */}
        <TemporaryDataProvider>  {/* In-memory sharing */}
          <TermsGuard>     {/* Force terms acceptance */}
            <Router />
          </TermsGuard>
        </TemporaryDataProvider>
      </SettingsProvider>
    </SessionProvider>
  </AuthProvider>
</QueryClientProvider>
```

### AuthContext

```typescript
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

// Checks session on mount
useEffect(() => {
  fetch("/api/auth/me", { credentials: "include" })
    .then(res => res.ok ? res.json() : null)
    .then(setUser)
    .finally(() => setIsLoading(false));
}, []);
```

### SessionContext (WebSocket)

```typescript
// Handles force logout notifications
useEffect(() => {
  if (!user) return;
  
  const ws = new WebSocket(`${wsUrl}/ws?userId=${user.id}`);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === "FORCE_LOGOUT_WARNING") {
      toast({ title: "Warning", description: data.message });
    }
    
    if (data.type === "FORCE_LOGOUT") {
      logout();
      navigate("/login");
    }
  };
  
  return () => ws.close();
}, [user]);
```

### TanStack Query Setup

```typescript
// client/src/lib/queryClient.ts

const defaultQueryFn = async ({ queryKey }) => {
  const res = await fetch(queryKey[0], { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

// Helper for mutations
export async function apiRequest(method, url, body?) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### Theme System

```css
/* client/src/index.css */

:root {
  --background: 222 47% 11%;
  --foreground: 213 31% 91%;
  --card: 222 47% 13%;
  --primary: 210 100% 52%;
  --muted: 215 25% 27%;
  /* ... */
}

/* Three color palettes */
.theme-dark { /* Default dark theme */ }
.theme-midnight { /* Deep blue variant */ }
.theme-ocean { /* Teal variant */ }
```

### Glass Morphism UI

```css
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

---

## Configuration & Environment

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Session
SESSION_SECRET=your-secure-random-string

# AI
OPENAI_API_KEY=sk-...

# AI (optional fallback/base URL overrides)
OPENAI_FALLBACK_API_KEY=sk-...
OPENAI_FALLBACK_BASE_URL=https://api.openai.com/v1

# Virus Scanning
CLOUDMERSIVE_API_KEY=...
```

### Vite Configuration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
});
```

### Drizzle Configuration

```typescript
// drizzle.config.ts
export default {
  schema: "./shared/schema.ts",
  out: "./drizzle",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
};
```

---

## Deployment

### Deployment

1. **Development**: `npm run dev` - Runs Express + Vite on port 5000
2. **Production**: Build with `npm run build`, then run `npm run start`
3. **Database**: Provide `DATABASE_URL` for PostgreSQL

### Database Migrations

```bash
# Push schema changes
npm run db:push

# Force push (use with caution)
npm run db:push --force
```

### Build Commands

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build",
    "start": "NODE_ENV=production node dist/server/index.js",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

## Key Implementation Notes

### 1. EMAR Grid Detection

The system detects table structure in uploaded documents to handle both grid layouts (dates as columns) and list formats (each entry on separate line).

### 2. Prompt Caching

OpenAI automatically caches static system prompts (50% discount, 5-10 min TTL). Structure prompts with static content first, dynamic content in user messages.

### 3. SSE Streaming

AI responses use Server-Sent Events for real-time display. Frontend uses `EventSource` API or fetch with readable streams.

### 4. Session Cookies

Uses `SameSite=None; Secure; Partitioned` for cross-origin iframe compatibility when required.

### 5. File Scanning

All uploads go through Cloudmersive virus scan. Results are cached by file hash. Threats block upload immediately.

### 6. Initials Only

Never store or display full service user names. Always normalize to initials format (e.g., "K.S.").

---

## Summary

CareAssurance is a comprehensive healthcare compliance platform built with:

- React + TypeScript frontend with TanStack Query
- Express + TypeScript backend with Drizzle ORM
- PostgreSQL database with UUID primary keys
- OpenAI integration with tiered model selection
- Session-based auth with PostgreSQL store
- Real-time updates via WebSocket
- Glass morphism dark theme UI

The application prioritizes privacy (initials only, PII scrubbing), cost efficiency (tiered AI models, caching), and compliance (CQC focus, audit trails).
