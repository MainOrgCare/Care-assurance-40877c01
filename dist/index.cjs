"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc2) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc2 = __getOwnPropDesc(from, key)) || desc2.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/index.ts
var index_exports = {};
__export(index_exports, {
  log: () => log
});
module.exports = __toCommonJS(index_exports);
var import_express2 = __toESM(require("express"), 1);
var import_compression = __toESM(require("compression"), 1);

// server/routes.ts
var import_ws = require("ws");

// server/storage.ts
var import_drizzle_orm2 = require("drizzle-orm");
var import_node_postgres = require("drizzle-orm/node-postgres");
var import_pg = __toESM(require("pg"), 1);
var import_bcrypt = __toESM(require("bcrypt"), 1);

// shared/schema.ts
var import_drizzle_orm = require("drizzle-orm");
var import_pg_core = require("drizzle-orm/pg-core");
var import_drizzle_zod = require("drizzle-zod");
var users = (0, import_pg_core.pgTable)("users", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  username: (0, import_pg_core.text)("username").notNull().unique(),
  firstName: (0, import_pg_core.text)("first_name"),
  lastName: (0, import_pg_core.text)("last_name"),
  password: (0, import_pg_core.text)("password").notNull(),
  role: (0, import_pg_core.text)("role").notNull().default("staff"),
  // 'admin' or 'staff'
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  // 'pending' or 'active'
  jobTitle: (0, import_pg_core.text)("job_title"),
  suspendedUntil: (0, import_pg_core.timestamp)("suspended_until"),
  lastOnlineAt: (0, import_pg_core.timestamp)("last_online_at"),
  dashboardWidgets: (0, import_pg_core.jsonb)("dashboard_widgets"),
  // Array of widget IDs in display order
  termsAcceptedAt: (0, import_pg_core.timestamp)("terms_accepted_at"),
  // When user accepted terms
  termsVersion: (0, import_pg_core.text)("terms_version"),
  // Which version of terms they accepted
  termsSignatureName: (0, import_pg_core.text)("terms_signature_name"),
  // Full name typed by user when accepting
  termsSignatureDate: (0, import_pg_core.text)("terms_signature_date"),
  // Date typed by user when accepting (DD/MM/YYYY)
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertUserSchema = (0, import_drizzle_zod.createInsertSchema)(users).omit({
  id: true,
  createdAt: true
});
var careWorkers = (0, import_pg_core.pgTable)("care_workers", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  name: (0, import_pg_core.text)("name").notNull(),
  // Anonymized format: L.Barron
  role: (0, import_pg_core.text)("role").notNull(),
  // 'Care Coordinator', 'Carer', etc.
  status: (0, import_pg_core.text)("status").notNull().default("active"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertCareWorkerSchema = (0, import_drizzle_zod.createInsertSchema)(careWorkers).omit({
  id: true,
  createdAt: true
});
var discrepancies = (0, import_pg_core.pgTable)("discrepancies", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  careWorkerId: (0, import_pg_core.varchar)("care_worker_id").notNull().references(() => careWorkers.id),
  type: (0, import_pg_core.text)("type").notNull(),
  // 'EMAR' or 'Visit Audit'
  date: (0, import_pg_core.text)("date").notNull(),
  // Format: DD/MMM/YYYY
  description: (0, import_pg_core.text)("description").notNull(),
  action: (0, import_pg_core.text)("action").notNull(),
  // 'Office Discussion', 'Performance Note', etc.
  severity: (0, import_pg_core.text)("severity"),
  // 'low', 'medium', 'high'
  actionMedium: (0, import_pg_core.text)("action_medium"),
  // 'meeting', 'phone', 'video', 'manager'
  manager: (0, import_pg_core.text)("manager"),
  // Manager name if referred
  notes: (0, import_pg_core.text)("notes"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertDiscrepancySchema = (0, import_drizzle_zod.createInsertSchema)(discrepancies).omit({
  id: true,
  createdAt: true
});
var audits = (0, import_pg_core.pgTable)("audits", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  serviceUserName: (0, import_pg_core.text)("service_user_name").notNull(),
  // Anonymized: K.Spencer
  auditor: (0, import_pg_core.text)("auditor").notNull(),
  auditType: (0, import_pg_core.text)("audit_type").notNull(),
  // 'EMAR' or 'Visit'
  periodStart: (0, import_pg_core.text)("period_start").notNull(),
  // DD/MMM/YYYY
  periodEnd: (0, import_pg_core.text)("period_end").notNull(),
  // DD/MMM/YYYY
  results: (0, import_pg_core.jsonb)("results").notNull(),
  // Stores full audit data
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertAuditSchema = (0, import_drizzle_zod.createInsertSchema)(audits).omit({
  id: true,
  createdAt: true
});
var adminAlerts = (0, import_pg_core.pgTable)("admin_alerts", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  careWorkerId: (0, import_pg_core.varchar)("care_worker_id").notNull().references(() => careWorkers.id),
  careWorkerName: (0, import_pg_core.text)("care_worker_name").notNull(),
  message: (0, import_pg_core.text)("message").notNull(),
  discrepancyType: (0, import_pg_core.text)("discrepancy_type").notNull(),
  // 'EMAR' or 'Visit Audit'
  discrepancyCount: (0, import_pg_core.integer)("discrepancy_count").notNull(),
  isRead: (0, import_pg_core.boolean)("is_read").notNull().default(false),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertAdminAlertSchema = (0, import_drizzle_zod.createInsertSchema)(adminAlerts).omit({
  id: true,
  createdAt: true
});
var activeSessions = (0, import_pg_core.pgTable)("active_sessions", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  username: (0, import_pg_core.text)("username").notNull(),
  role: (0, import_pg_core.text)("role").notNull(),
  sessionId: (0, import_pg_core.text)("session_id").notNull(),
  ipAddress: (0, import_pg_core.text)("ip_address"),
  city: (0, import_pg_core.text)("city"),
  region: (0, import_pg_core.text)("region"),
  country: (0, import_pg_core.text)("country"),
  latitude: (0, import_pg_core.text)("latitude"),
  longitude: (0, import_pg_core.text)("longitude"),
  lastActivity: (0, import_pg_core.timestamp)("last_activity").notNull().defaultNow(),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertActiveSessionSchema = (0, import_drizzle_zod.createInsertSchema)(activeSessions).omit({
  id: true,
  lastActivity: true,
  createdAt: true
});
var riskAssessmentLogs = (0, import_pg_core.pgTable)("risk_assessment_logs", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  serviceUserInitials: (0, import_pg_core.text)("service_user_initials").notNull(),
  // Only initials like "K.S." - NO full names
  performedBy: (0, import_pg_core.text)("performed_by").notNull(),
  performedByJobTitle: (0, import_pg_core.text)("performed_by_job_title"),
  offeredAssessments: (0, import_pg_core.jsonb)("offered_assessments").notNull(),
  // Array of assessment names
  selectedAssessments: (0, import_pg_core.jsonb)("selected_assessments").notNull(),
  // Array of selected assessment names
  skippedMandatory: (0, import_pg_core.jsonb)("skipped_mandatory").notNull(),
  // Array of mandatory assessments that were skipped
  documentSummary: (0, import_pg_core.text)("document_summary"),
  // Summary of what was analyzed
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var policyDocuments = (0, import_pg_core.pgTable)("policy_documents", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  name: (0, import_pg_core.text)("name").notNull(),
  // e.g., "Medication Policy", "EMAR Audit SOP"
  category: (0, import_pg_core.text)("category").notNull(),
  // "medication", "emar_audit", "prn_protocol", "care_plan"
  content: (0, import_pg_core.text)("content").notNull(),
  // Full text content of the policy section
  keywords: (0, import_pg_core.text)("keywords").array(),
  // Keywords for matching relevant sections
  version: (0, import_pg_core.text)("version"),
  // Document version
  lastUpdated: (0, import_pg_core.timestamp)("last_updated").notNull().defaultNow(),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertPolicyDocumentSchema = (0, import_drizzle_zod.createInsertSchema)(policyDocuments).omit({
  id: true,
  createdAt: true
});
var systemLogs = (0, import_pg_core.pgTable)("system_logs", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  eventType: (0, import_pg_core.text)("event_type").notNull(),
  // "audit_completed", "user_login", "session_disconnect"
  userId: (0, import_pg_core.varchar)("user_id"),
  username: (0, import_pg_core.text)("username"),
  details: (0, import_pg_core.jsonb)("details"),
  // Additional event details
  serviceUserInitials: (0, import_pg_core.text)("service_user_initials"),
  // Only initials for privacy
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertSystemLogSchema = (0, import_drizzle_zod.createInsertSchema)(systemLogs).omit({
  id: true,
  createdAt: true
});
var insertRiskAssessmentLogSchema = (0, import_drizzle_zod.createInsertSchema)(riskAssessmentLogs).omit({
  id: true,
  createdAt: true
});
var sessionHistory = (0, import_pg_core.pgTable)("session_history", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  username: (0, import_pg_core.text)("username").notNull(),
  sessionId: (0, import_pg_core.text)("session_id").notNull(),
  ipAddress: (0, import_pg_core.text)("ip_address"),
  city: (0, import_pg_core.text)("city"),
  country: (0, import_pg_core.text)("country"),
  loggedInAt: (0, import_pg_core.timestamp)("logged_in_at").notNull().defaultNow(),
  loggedOutAt: (0, import_pg_core.timestamp)("logged_out_at"),
  durationSeconds: (0, import_pg_core.integer)("duration_seconds"),
  terminatedByAdmin: (0, import_pg_core.boolean)("terminated_by_admin").default(false)
});
var insertSessionHistorySchema = (0, import_drizzle_zod.createInsertSchema)(sessionHistory).omit({
  id: true
});
var suspensionLogs = (0, import_pg_core.pgTable)("suspension_logs", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  username: (0, import_pg_core.text)("username").notNull(),
  adminId: (0, import_pg_core.varchar)("admin_id").notNull(),
  adminUsername: (0, import_pg_core.text)("admin_username").notNull(),
  durationMinutes: (0, import_pg_core.integer)("duration_minutes").notNull(),
  reason: (0, import_pg_core.text)("reason"),
  startsAt: (0, import_pg_core.timestamp)("starts_at").notNull().defaultNow(),
  endsAt: (0, import_pg_core.timestamp)("ends_at").notNull(),
  reinstatedEarly: (0, import_pg_core.boolean)("reinstated_early").default(false),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertSuspensionLogSchema = (0, import_drizzle_zod.createInsertSchema)(suspensionLogs).omit({
  id: true,
  createdAt: true
});
var emarRefusalReviews = (0, import_pg_core.pgTable)("emar_refusal_reviews", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  auditId: (0, import_pg_core.varchar)("audit_id"),
  // Reference to the audit if saved
  careWorkerName: (0, import_pg_core.text)("care_worker_name").notNull(),
  medication: (0, import_pg_core.text)("medication").notNull(),
  refusalDate: (0, import_pg_core.text)("refusal_date").notNull(),
  // DD/MMM/YYYY format
  timeSlot: (0, import_pg_core.text)("time_slot"),
  reasonAcceptable: (0, import_pg_core.boolean)("reason_acceptable").notNull().default(false),
  reviewerNotes: (0, import_pg_core.text)("reviewer_notes"),
  reviewedBy: (0, import_pg_core.text)("reviewed_by").notNull(),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at").notNull().defaultNow(),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertEmarRefusalReviewSchema = (0, import_drizzle_zod.createInsertSchema)(emarRefusalReviews).omit({
  id: true,
  reviewedAt: true,
  createdAt: true
});
var blockedIps = (0, import_pg_core.pgTable)("blocked_ips", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  ipAddress: (0, import_pg_core.text)("ip_address").notNull().unique(),
  blockedBy: (0, import_pg_core.text)("blocked_by").notNull(),
  reason: (0, import_pg_core.text)("reason"),
  username: (0, import_pg_core.text)("username"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertBlockedIpSchema = (0, import_drizzle_zod.createInsertSchema)(blockedIps).omit({
  id: true,
  createdAt: true
});
var fileScanLogs = (0, import_pg_core.pgTable)("file_scan_logs", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  fileName: (0, import_pg_core.text)("file_name").notNull(),
  fileHash: (0, import_pg_core.text)("file_hash").notNull(),
  fileSize: (0, import_pg_core.integer)("file_size").notNull(),
  scanResult: (0, import_pg_core.text)("scan_result").notNull(),
  // 'clean' or 'threat'
  threatsFound: (0, import_pg_core.text)("threats_found"),
  // JSON if threats
  scannedBy: (0, import_pg_core.text)("scanned_by"),
  uploadType: (0, import_pg_core.text)("upload_type"),
  // 'policy-document', 'parse-pdf', 'emar-analysis'
  cachedResult: (0, import_pg_core.boolean)("cached_result").default(false),
  // True if result came from cache
  scannedAt: (0, import_pg_core.timestamp)("scanned_at").notNull().defaultNow()
});
var insertFileScanLogSchema = (0, import_drizzle_zod.createInsertSchema)(fileScanLogs).omit({
  id: true,
  scannedAt: true
});
var emarCorrections = (0, import_pg_core.pgTable)("emar_corrections", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  auditId: (0, import_pg_core.varchar)("audit_id"),
  adminId: (0, import_pg_core.varchar)("admin_id").notNull().references(() => users.id),
  adminUsername: (0, import_pg_core.text)("admin_username").notNull(),
  serviceUserInitials: (0, import_pg_core.text)("service_user_initials"),
  originalMedication: (0, import_pg_core.text)("original_medication").notNull(),
  originalDate: (0, import_pg_core.text)("original_date").notNull(),
  originalTimeSlot: (0, import_pg_core.text)("original_time_slot"),
  originalCode: (0, import_pg_core.text)("original_code"),
  originalCareWorker: (0, import_pg_core.text)("original_care_worker"),
  correctedMedication: (0, import_pg_core.text)("corrected_medication"),
  correctedDate: (0, import_pg_core.text)("corrected_date"),
  correctedTimeSlot: (0, import_pg_core.text)("corrected_time_slot"),
  correctedCode: (0, import_pg_core.text)("corrected_code"),
  correctedCareWorker: (0, import_pg_core.text)("corrected_care_worker"),
  correctionNote: (0, import_pg_core.text)("correction_note"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertEmarCorrectionSchema = (0, import_drizzle_zod.createInsertSchema)(emarCorrections).omit({
  id: true,
  createdAt: true
});
var aiUsageLogs = (0, import_pg_core.pgTable)("ai_usage_logs", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id),
  username: (0, import_pg_core.text)("username"),
  featureName: (0, import_pg_core.text)("feature").notNull(),
  model: (0, import_pg_core.text)("model").notNull(),
  billingSource: (0, import_pg_core.text)("billing_source").notNull().default("replit"),
  // 'replit' or 'openai' - which API was billed
  provider: (0, import_pg_core.text)("provider").notNull().default("replit"),
  // 'replit' or 'openai' - which API was billed
  inputTokens: (0, import_pg_core.integer)("input_tokens").notNull().default(0),
  outputTokens: (0, import_pg_core.integer)("output_tokens").notNull().default(0),
  totalTokens: (0, import_pg_core.integer)("total_tokens").notNull().default(0),
  costMicroDollars: (0, import_pg_core.integer)("cost_micros").notNull().default(0),
  durationMs: (0, import_pg_core.integer)("duration_ms"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertAiUsageLogSchema = (0, import_drizzle_zod.createInsertSchema)(aiUsageLogs).omit({
  id: true,
  createdAt: true
});

// server/storage.ts
var { Pool } = import_pg.default;
var SALT_ROUNDS = 10;
var DatabaseStorage = class {
  db;
  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    this.db = (0, import_node_postgres.drizzle)(pool);
  }
  // User operations
  async getUser(id) {
    const result = await this.db.select().from(users).where((0, import_drizzle_orm2.eq)(users.id, id));
    return result[0];
  }
  async getUserByUsername(username) {
    const result = await this.db.select().from(users).where(import_drizzle_orm2.sql`lower(${users.username}) = lower(${username})`);
    return result[0];
  }
  async getAllUsers() {
    return await this.db.select().from(users).orderBy((0, import_drizzle_orm2.desc)(users.createdAt));
  }
  async getPendingUsers() {
    return await this.db.select().from(users).where((0, import_drizzle_orm2.eq)(users.status, "pending")).orderBy((0, import_drizzle_orm2.desc)(users.createdAt));
  }
  async createUser(user) {
    const hashedPassword = await import_bcrypt.default.hash(user.password, SALT_ROUNDS);
    const result = await this.db.insert(users).values({
      ...user,
      password: hashedPassword
    }).returning();
    return result[0];
  }
  async verifyPassword(plainPassword, hashedPassword) {
    return import_bcrypt.default.compare(plainPassword, hashedPassword);
  }
  async updateUserStatus(id, status) {
    const result = await this.db.update(users).set({ status }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async updateUserJobTitle(id, jobTitle) {
    const result = await this.db.update(users).set({ jobTitle }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async updateUserRole(id, role) {
    const result = await this.db.update(users).set({ role }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async deleteUser(id) {
    await this.db.delete(sessionHistory).where((0, import_drizzle_orm2.eq)(sessionHistory.userId, id));
    await this.db.delete(activeSessions).where((0, import_drizzle_orm2.eq)(activeSessions.userId, id));
    await this.db.delete(suspensionLogs).where((0, import_drizzle_orm2.eq)(suspensionLogs.userId, id));
    await this.db.delete(users).where((0, import_drizzle_orm2.eq)(users.id, id));
  }
  // Care Worker operations
  async getCareWorker(id) {
    const result = await this.db.select().from(careWorkers).where((0, import_drizzle_orm2.eq)(careWorkers.id, id));
    return result[0];
  }
  async getAllCareWorkers() {
    return await this.db.select().from(careWorkers).orderBy(careWorkers.name);
  }
  async createCareWorker(worker) {
    const result = await this.db.insert(careWorkers).values(worker).returning();
    return result[0];
  }
  async updateCareWorker(id, worker) {
    const result = await this.db.update(careWorkers).set(worker).where((0, import_drizzle_orm2.eq)(careWorkers.id, id)).returning();
    return result[0];
  }
  // Discrepancy operations
  async getDiscrepanciesByCareWorker(careWorkerId) {
    return await this.db.select().from(discrepancies).where((0, import_drizzle_orm2.eq)(discrepancies.careWorkerId, careWorkerId)).orderBy((0, import_drizzle_orm2.desc)(discrepancies.createdAt));
  }
  async getDiscrepancyCountByType(careWorkerId, type) {
    const result = await this.db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(discrepancies).where(
      (0, import_drizzle_orm2.and)(
        (0, import_drizzle_orm2.eq)(discrepancies.careWorkerId, careWorkerId),
        (0, import_drizzle_orm2.eq)(discrepancies.type, type)
      )
    );
    return Number(result[0].count);
  }
  async createDiscrepancy(discrepancy) {
    const result = await this.db.insert(discrepancies).values(discrepancy).returning();
    return result[0];
  }
  async getAllDiscrepancies() {
    const result = await this.db.select().from(discrepancies).innerJoin(careWorkers, (0, import_drizzle_orm2.eq)(discrepancies.careWorkerId, careWorkers.id)).orderBy((0, import_drizzle_orm2.desc)(discrepancies.createdAt));
    return result.map((row) => ({
      ...row.discrepancies,
      careWorker: row.care_workers
    }));
  }
  // Audit operations
  async createAudit(audit) {
    const result = await this.db.insert(audits).values(audit).returning();
    return result[0];
  }
  async getAuditsByServiceUser(serviceUserName) {
    return await this.db.select().from(audits).where((0, import_drizzle_orm2.eq)(audits.serviceUserName, serviceUserName)).orderBy((0, import_drizzle_orm2.desc)(audits.createdAt));
  }
  async getAllAudits() {
    return await this.db.select().from(audits).orderBy((0, import_drizzle_orm2.desc)(audits.createdAt));
  }
  // Admin Alert operations
  async createAdminAlert(alert) {
    const result = await this.db.insert(adminAlerts).values(alert).returning();
    return result[0];
  }
  async getUnreadAdminAlerts() {
    return await this.db.select().from(adminAlerts).where((0, import_drizzle_orm2.eq)(adminAlerts.isRead, false)).orderBy((0, import_drizzle_orm2.desc)(adminAlerts.createdAt));
  }
  async markAlertAsRead(id) {
    await this.db.update(adminAlerts).set({ isRead: true }).where((0, import_drizzle_orm2.eq)(adminAlerts.id, id));
  }
  // Active Session operations
  async createActiveSession(session2) {
    await this.db.delete(activeSessions).where((0, import_drizzle_orm2.eq)(activeSessions.userId, session2.userId));
    const result = await this.db.insert(activeSessions).values(session2).returning();
    return result[0];
  }
  async getActiveSessionByUserId(userId) {
    const result = await this.db.select().from(activeSessions).where((0, import_drizzle_orm2.eq)(activeSessions.userId, userId));
    return result[0];
  }
  async getActiveSessionBySessionId(sessionId) {
    const result = await this.db.select().from(activeSessions).where((0, import_drizzle_orm2.eq)(activeSessions.sessionId, sessionId));
    return result[0];
  }
  async getAllActiveSessions() {
    return await this.db.select().from(activeSessions).orderBy((0, import_drizzle_orm2.desc)(activeSessions.lastActivity));
  }
  async getNonAdminActiveSessions() {
    return await this.db.select().from(activeSessions).where(import_drizzle_orm2.sql`${activeSessions.role} != 'admin'`).orderBy(activeSessions.lastActivity);
  }
  async updateSessionActivity(sessionId) {
    await this.db.update(activeSessions).set({ lastActivity: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(activeSessions.sessionId, sessionId));
  }
  async deleteActiveSession(sessionId) {
    await this.db.delete(activeSessions).where((0, import_drizzle_orm2.eq)(activeSessions.sessionId, sessionId));
  }
  async deleteActiveSessionByUserId(userId) {
    await this.db.delete(activeSessions).where((0, import_drizzle_orm2.eq)(activeSessions.userId, userId));
  }
  async getActiveSessionCount() {
    const result = await this.db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(activeSessions);
    return Number(result[0].count);
  }
  async getNonAdminSessionCount() {
    const result = await this.db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(activeSessions).where(import_drizzle_orm2.sql`${activeSessions.role} != 'admin'`);
    return Number(result[0].count);
  }
  // Risk Assessment Log operations
  async createRiskAssessmentLog(log2) {
    const result = await this.db.insert(riskAssessmentLogs).values(log2).returning();
    return result[0];
  }
  async getAllRiskAssessmentLogs() {
    return await this.db.select().from(riskAssessmentLogs).orderBy((0, import_drizzle_orm2.desc)(riskAssessmentLogs.createdAt));
  }
  async getRiskAssessmentLogsByServiceUser(serviceUserInitials) {
    return await this.db.select().from(riskAssessmentLogs).where((0, import_drizzle_orm2.eq)(riskAssessmentLogs.serviceUserInitials, serviceUserInitials)).orderBy((0, import_drizzle_orm2.desc)(riskAssessmentLogs.createdAt));
  }
  // Session History operations
  async createSessionHistory(log2) {
    const result = await this.db.insert(sessionHistory).values(log2).returning();
    return result[0];
  }
  async getSessionHistoryByUser(userId) {
    return await this.db.select().from(sessionHistory).where((0, import_drizzle_orm2.eq)(sessionHistory.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(sessionHistory.loggedInAt));
  }
  async getAllSessionHistory() {
    return await this.db.select().from(sessionHistory).orderBy((0, import_drizzle_orm2.desc)(sessionHistory.loggedInAt));
  }
  async updateSessionLogout(sessionId, terminatedByAdmin = false) {
    const now = /* @__PURE__ */ new Date();
    const record = await this.db.select().from(sessionHistory).where((0, import_drizzle_orm2.eq)(sessionHistory.sessionId, sessionId));
    if (record.length > 0 && record[0].loggedInAt) {
      const durationSeconds = Math.floor((now.getTime() - new Date(record[0].loggedInAt).getTime()) / 1e3);
      await this.db.update(sessionHistory).set({
        loggedOutAt: now,
        durationSeconds,
        terminatedByAdmin
      }).where((0, import_drizzle_orm2.eq)(sessionHistory.sessionId, sessionId));
    }
  }
  // Suspension Log operations
  async createSuspensionLog(log2) {
    const result = await this.db.insert(suspensionLogs).values(log2).returning();
    return result[0];
  }
  async getSuspensionLogs() {
    return await this.db.select().from(suspensionLogs).orderBy((0, import_drizzle_orm2.desc)(suspensionLogs.createdAt));
  }
  async getSuspensionLogsByUser(userId) {
    return await this.db.select().from(suspensionLogs).where((0, import_drizzle_orm2.eq)(suspensionLogs.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(suspensionLogs.createdAt));
  }
  async reinstateSuspension(id) {
    const result = await this.db.update(suspensionLogs).set({ reinstatedEarly: true }).where((0, import_drizzle_orm2.eq)(suspensionLogs.id, id)).returning();
    return result[0];
  }
  // Enhanced User operations
  async updateUserName(id, firstName, lastName) {
    const result = await this.db.update(users).set({ firstName, lastName }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async updateUsername(id, username) {
    const result = await this.db.update(users).set({ username }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async suspendUser(id, suspendedUntil) {
    const result = await this.db.update(users).set({ suspendedUntil }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async updateLastOnlineAt(id) {
    const result = await this.db.update(users).set({ lastOnlineAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async updateUserPassword(id, hashedPassword) {
    const result = await this.db.update(users).set({ password: hashedPassword }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async updateUserTermsAcceptance(id, version, signatureName, signatureDate) {
    const result = await this.db.update(users).set({
      termsAcceptedAt: /* @__PURE__ */ new Date(),
      termsVersion: version,
      termsSignatureName: signatureName,
      termsSignatureDate: signatureDate
    }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async updateDashboardWidgets(id, widgets) {
    const result = await this.db.update(users).set({ dashboardWidgets: widgets }).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return result[0];
  }
  async getDashboardWidgets(id) {
    const user = await this.getUser(id);
    return user?.dashboardWidgets;
  }
  async resetAllPerformanceData() {
    const careWorkersResult = await this.db.delete(careWorkers).returning();
    const discrepanciesResult = await this.db.delete(discrepancies).returning();
    const auditsResult = await this.db.delete(audits).returning();
    const adminAlertsResult = await this.db.delete(adminAlerts).returning();
    return {
      careWorkers: careWorkersResult.length,
      discrepancies: discrepanciesResult.length,
      audits: auditsResult.length,
      adminAlerts: adminAlertsResult.length
    };
  }
  async getDashboardStats24h() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    const auditsResult = await this.db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(audits).where(import_drizzle_orm2.sql`${audits.createdAt} >= ${twentyFourHoursAgo}`);
    const alertsResult = await this.db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(adminAlerts).where((0, import_drizzle_orm2.and)(
      (0, import_drizzle_orm2.eq)(adminAlerts.isRead, false),
      import_drizzle_orm2.sql`${adminAlerts.createdAt} >= ${twentyFourHoursAgo}`
    ));
    const emarAuditsResult = await this.db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(audits).where((0, import_drizzle_orm2.and)(
      (0, import_drizzle_orm2.eq)(audits.auditType, "EMAR"),
      import_drizzle_orm2.sql`${audits.createdAt} >= ${twentyFourHoursAgo}`
    ));
    const visitAuditsResult = await this.db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(audits).where((0, import_drizzle_orm2.and)(
      (0, import_drizzle_orm2.eq)(audits.auditType, "Visit"),
      import_drizzle_orm2.sql`${audits.createdAt} >= ${twentyFourHoursAgo}`
    ));
    const riskAssessmentsResult = await this.db.select({ count: import_drizzle_orm2.sql`count(*)` }).from(riskAssessmentLogs).where(import_drizzle_orm2.sql`${riskAssessmentLogs.createdAt} >= ${twentyFourHoursAgo}`);
    return {
      auditsCompleted: Number(auditsResult[0].count),
      activeAlerts: Number(alertsResult[0].count),
      plansUpdated: Number(visitAuditsResult[0].count),
      medicationAudits: Number(emarAuditsResult[0].count),
      carePlanReviews: Number(visitAuditsResult[0].count),
      riskAssessments: Number(riskAssessmentsResult[0].count)
    };
  }
  async getRecentAlerts24h() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    return await this.db.select().from(adminAlerts).where(import_drizzle_orm2.sql`${adminAlerts.createdAt} >= ${twentyFourHoursAgo}`).orderBy((0, import_drizzle_orm2.desc)(adminAlerts.createdAt)).limit(5);
  }
  async createPolicyDocument(doc) {
    const result = await this.db.insert(policyDocuments).values(doc).returning();
    return result[0];
  }
  async getPolicyDocumentsByCategory(category) {
    return await this.db.select().from(policyDocuments).where((0, import_drizzle_orm2.eq)(policyDocuments.category, category)).orderBy((0, import_drizzle_orm2.desc)(policyDocuments.lastUpdated));
  }
  async getAllPolicyDocuments() {
    return await this.db.select().from(policyDocuments).orderBy((0, import_drizzle_orm2.desc)(policyDocuments.lastUpdated));
  }
  async updatePolicyDocument(id, doc) {
    const result = await this.db.update(policyDocuments).set({ ...doc, lastUpdated: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(policyDocuments.id, id)).returning();
    return result[0];
  }
  async deletePolicyDocument(id) {
    await this.db.delete(policyDocuments).where((0, import_drizzle_orm2.eq)(policyDocuments.id, id));
  }
  // Blocked IP operations
  async blockIp(blockedIp) {
    const result = await this.db.insert(blockedIps).values(blockedIp).returning();
    return result[0];
  }
  async unblockIp(id) {
    await this.db.delete(blockedIps).where((0, import_drizzle_orm2.eq)(blockedIps.id, id));
  }
  async isIpBlocked(ipAddress) {
    const result = await this.db.select().from(blockedIps).where((0, import_drizzle_orm2.eq)(blockedIps.ipAddress, ipAddress));
    return result.length > 0;
  }
  async getBlockedIpByAddress(ipAddress) {
    const result = await this.db.select().from(blockedIps).where((0, import_drizzle_orm2.eq)(blockedIps.ipAddress, ipAddress));
    return result[0];
  }
  async getAllBlockedIps() {
    return await this.db.select().from(blockedIps).orderBy((0, import_drizzle_orm2.desc)(blockedIps.createdAt));
  }
  // EMAR Refusal Review operations
  async createRefusalReview(review) {
    const result = await this.db.insert(emarRefusalReviews).values(review).returning();
    return result[0];
  }
  async getRefusalReviewsByAudit(auditId) {
    return await this.db.select().from(emarRefusalReviews).where((0, import_drizzle_orm2.eq)(emarRefusalReviews.auditId, auditId)).orderBy((0, import_drizzle_orm2.desc)(emarRefusalReviews.createdAt));
  }
  async updateRefusalReview(id, reasonAcceptable, reviewedBy, notes) {
    const result = await this.db.update(emarRefusalReviews).set({
      reasonAcceptable,
      reviewerNotes: notes,
      reviewedBy,
      reviewedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm2.eq)(emarRefusalReviews.id, id)).returning();
    return result[0];
  }
  async getAllRefusalReviews() {
    return await this.db.select().from(emarRefusalReviews).orderBy((0, import_drizzle_orm2.desc)(emarRefusalReviews.createdAt));
  }
  // File Scan Log operations
  async createFileScanLog(log2) {
    const result = await this.db.insert(fileScanLogs).values(log2).returning();
    return result[0];
  }
  async getFileScanLogByHash(fileHash) {
    const result = await this.db.select().from(fileScanLogs).where((0, import_drizzle_orm2.eq)(fileScanLogs.fileHash, fileHash)).orderBy((0, import_drizzle_orm2.desc)(fileScanLogs.scannedAt)).limit(1);
    return result[0];
  }
  async getAllFileScanLogs() {
    return await this.db.select().from(fileScanLogs).orderBy((0, import_drizzle_orm2.desc)(fileScanLogs.scannedAt));
  }
  // EMAR Correction operations
  async createEmarCorrection(correction) {
    const result = await this.db.insert(emarCorrections).values(correction).returning();
    return result[0];
  }
  async getRecentEmarCorrections(limit = 50) {
    return await this.db.select().from(emarCorrections).orderBy((0, import_drizzle_orm2.desc)(emarCorrections.createdAt)).limit(limit);
  }
  // AI Usage Log operations
  async createAiUsageLog(log2) {
    const result = await this.db.insert(aiUsageLogs).values(log2).returning();
    return result[0];
  }
  async getAiUsageLogs(options) {
    const limit = options?.limit || 100;
    let query = this.db.select().from(aiUsageLogs);
    if (options?.startDate && options?.endDate) {
      query = query.where(
        (0, import_drizzle_orm2.and)(
          import_drizzle_orm2.sql`${aiUsageLogs.createdAt} >= ${options.startDate}`,
          import_drizzle_orm2.sql`${aiUsageLogs.createdAt} <= ${options.endDate}`
        )
      );
    }
    return await query.orderBy((0, import_drizzle_orm2.desc)(aiUsageLogs.createdAt)).limit(limit);
  }
  async getAiUsageStats() {
    const logs = await this.db.select().from(aiUsageLogs);
    let totalCost = 0;
    let totalCalls = 0;
    const byFeature = {};
    for (const log2 of logs) {
      totalCost += log2.costMicroDollars;
      totalCalls++;
      if (!byFeature[log2.featureName]) {
        byFeature[log2.featureName] = { calls: 0, cost: 0, tokens: 0 };
      }
      byFeature[log2.featureName].calls++;
      byFeature[log2.featureName].cost += log2.costMicroDollars;
      byFeature[log2.featureName].tokens += log2.totalTokens;
    }
    return { totalCost, totalCalls, byFeature };
  }
};
var storage = new DatabaseStorage();

// server/routes.ts
var import_express_session = __toESM(require("express-session"), 1);
var import_connect_pg_simple = __toESM(require("connect-pg-simple"), 1);
var import_pg2 = __toESM(require("pg"), 1);
var import_zod = require("zod");

// server/services/aiClient.ts
var import_openai = __toESM(require("openai"), 1);

// server/config/aiPricing.ts
var AI_PRICING = {
  // GPT-5.2 - $1.75/1M input, $14.00/1M output (coding/agentic)
  "gpt-5.2": { input: 1750, output: 14e3 },
  // GPT-5.1 - $1.25/1M input, $10.00/1M output (flagship model)
  "gpt-5.1": { input: 1250, output: 1e4 },
  "gpt-5.1-chat-latest": { input: 1250, output: 1e4 },
  "gpt-5.1-codex": { input: 1250, output: 1e4 },
  "gpt-5.1-codex-max": { input: 1250, output: 1e4 },
  // GPT-5 - $1.25/1M input, $10.00/1M output
  "gpt-5": { input: 1250, output: 1e4 },
  "gpt-5-chat-latest": { input: 1250, output: 1e4 },
  "gpt-5-codex": { input: 1250, output: 1e4 },
  // GPT-5-mini - $0.25/1M input, $2.00/1M output (cost-efficient)
  "gpt-5-mini": { input: 250, output: 2e3 },
  "gpt-5.1-codex-mini": { input: 250, output: 2e3 },
  // GPT-5-nano - $0.05/1M input, $0.40/1M output (ultra-efficient)
  "gpt-5-nano": { input: 50, output: 400 },
  // GPT-4.1 - $2.00/1M input, $8.00/1M output
  "gpt-4.1": { input: 2e3, output: 8e3 },
  "gpt-4.1-2026-04-14": { input: 2e3, output: 8e3 },
  // GPT-4.1-mini - $0.40/1M input, $1.60/1M output
  "gpt-4.1-mini": { input: 400, output: 1600 },
  "gpt-4.1-mini-2026-04-14": { input: 400, output: 1600 },
  // GPT-4.1-nano - $0.10/1M input, $0.40/1M output
  "gpt-4.1-nano": { input: 100, output: 400 },
  "gpt-4.1-nano-2026-04-14": { input: 100, output: 400 },
  // GPT-4o models - $2.50/1M input, $10.00/1M output
  "gpt-4o": { input: 2500, output: 1e4 },
  "gpt-4o-2024-11-20": { input: 2500, output: 1e4 },
  "gpt-4o-2024-08-06": { input: 2500, output: 1e4 },
  // GPT-4o-mini - $0.15/1M input, $0.60/1M output
  "gpt-4o-mini": { input: 150, output: 600 },
  "gpt-4o-mini-2024-07-18": { input: 150, output: 600 },
  // O-series reasoning models
  "o1": { input: 15e3, output: 6e4 },
  "o1-mini": { input: 1100, output: 4400 },
  "o3": { input: 2e3, output: 8e3 },
  "o3-mini": { input: 1100, output: 4400 },
  "o4-mini": { input: 1100, output: 4400 },
  // GPT-4-turbo (legacy) - $10.00/1M input, $30.00/1M output
  "gpt-4-turbo": { input: 1e4, output: 3e4 },
  "gpt-4-turbo-2024-04-09": { input: 1e4, output: 3e4 },
  "gpt-4-turbo-preview": { input: 1e4, output: 3e4 },
  // GPT-3.5-turbo (legacy) - $0.50/1M input, $1.50/1M output
  "gpt-3.5-turbo": { input: 500, output: 1500 },
  "gpt-3.5-turbo-0125": { input: 500, output: 1500 },
  // Default fallback (uses gpt-4o rates)
  "default": { input: 2500, output: 1e4 }
};
function calculateCostMicroDollars(model, inputTokens, outputTokens) {
  const pricing = AI_PRICING[model] || AI_PRICING["default"];
  const inputCost = inputTokens / 1e3 * pricing.input;
  const outputCost = outputTokens / 1e3 * pricing.output;
  return Math.round(inputCost + outputCost);
}

// server/services/aiClient.ts
var replitClient = null;
function getReplitClient() {
  if (replitClient) return replitClient;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  replitClient = new import_openai.default({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  });
  return replitClient;
}
var preferredProvider = "replit";
var preferredModel = "gpt-5.1";
function getPreferredProvider() {
  return preferredProvider;
}
function setPreferredProvider(provider) {
  if (provider !== "replit" && provider !== "openai") {
    throw new Error("Invalid provider. Must be 'replit' or 'openai'");
  }
  preferredProvider = provider;
  console.log(`[AI Config] Preferred provider set to: ${provider}`);
}
function getPreferredModel() {
  console.log(`[AI DEBUG] getPreferredModel called, returning: ${preferredModel}`);
  return preferredModel;
}
var openaiClient = null;
function getOpenAIClient() {
  if (openaiClient) return openaiClient;
  const fallbackKey = process.env.OPENAI_FALLBACK_API_KEY;
  if (!fallbackKey) {
    return null;
  }
  openaiClient = new import_openai.default({
    apiKey: fallbackKey,
    baseURL: process.env.OPENAI_FALLBACK_BASE_URL || "https://api.openai.com/v1"
  });
  return openaiClient;
}
function shouldFallback(error) {
  const status = error?.status || error?.response?.status;
  if (status === 401 || status === 402 || status === 403 || status === 429 || status >= 500) {
    return true;
  }
  if (error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT" || error?.code === "ENOTFOUND") {
    return true;
  }
  if (error?.message?.toLowerCase().includes("billing") || error?.message?.toLowerCase().includes("quota") || error?.message?.toLowerCase().includes("rate limit")) {
    return true;
  }
  return false;
}
async function createChatCompletionWithProvider(params) {
  const preferred = preferredProvider;
  const openai3 = getOpenAIClient();
  const replit = getReplitClient();
  if (preferred === "openai" && openai3) {
    console.log("[AI] Admin preferred provider: OpenAI - initiating direct request...");
    try {
      const completion = await openai3.chat.completions.create(params);
      return { completion, provider: "openai" };
    } catch (openaiError) {
      console.error("[AI] OpenAI preferred request failed, falling back to Replit:", openaiError.message);
      if (shouldFallback(openaiError) && replit) {
        try {
          const completion = await replit.chat.completions.create(params);
          return { completion, provider: "replit" };
        } catch (replitError) {
          console.error("[AI] Replit fallback also failed:", replitError.message);
          throw replitError;
        }
      }
      throw openaiError;
    }
  }
  if (!replit && !openai3) {
    throw new Error("No AI provider is configured. Please set either AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_FALLBACK_API_KEY");
  }
  if (replit) {
    try {
      const completion = await replit.chat.completions.create(params);
      return { completion, provider: "replit" };
    } catch (replitError) {
      if (shouldFallback(replitError) && openai3) {
        console.log("[AI Failover] Replit failed, using OpenAI fallback");
        try {
          const completion = await openai3.chat.completions.create(params);
          return { completion, provider: "openai" };
        } catch (openaiError) {
          console.error("[AI Failover] OpenAI fallback also failed:", openaiError.message);
          throw openaiError;
        }
      } else if (!openai3) {
        console.warn("[AI Failover] Replit failed and no OpenAI fallback key configured");
      }
      throw replitError;
    }
  }
  if (openai3) {
    try {
      const completion = await openai3.chat.completions.create(params);
      return { completion, provider: "openai" };
    } catch (openaiError) {
      throw openaiError;
    }
  }
  throw new Error("No AI provider is available");
}
async function createChatCompletionWithLogging(params, featureName, userContext) {
  const startTime = Date.now();
  const model = params.model || "gpt-4o";
  const userId = userContext?.userId || null;
  const username = userContext?.username || null;
  if (!userContext) {
    console.warn(`[AI:${featureName}] WARNING: No user context provided - cost attribution will be incomplete`);
  }
  console.log(`[AI:${featureName}] Starting request with ${model}${username ? ` for ${username}` : ""}...`);
  let provider = "replit";
  try {
    const result = await createChatCompletionWithProvider(params);
    provider = result.provider;
    const duration = Date.now() - startTime;
    const inputTokens = result.completion.usage?.prompt_tokens || 0;
    const outputTokens = result.completion.usage?.completion_tokens || 0;
    const totalTokens = result.completion.usage?.total_tokens || 0;
    const costMicroDollars = calculateCostMicroDollars(model, inputTokens, outputTokens);
    console.log(`[AI:${featureName}] Completed in ${duration}ms, ${totalTokens} tokens, $${(costMicroDollars / 1e6).toFixed(4)} via ${provider}`);
    storage.createAiUsageLog({
      userId,
      username,
      featureName,
      model,
      billingSource: provider,
      provider,
      inputTokens,
      outputTokens,
      totalTokens,
      costMicroDollars,
      durationMs: duration
    }).catch((err) => console.error("[AI] Failed to log usage:", err.message));
    return result.completion;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[AI:${featureName}] Failed after ${duration}ms:`, error.message);
    storage.createAiUsageLog({
      userId,
      username,
      featureName,
      model,
      billingSource: provider,
      provider,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costMicroDollars: 0,
      durationMs: duration
    }).catch((err) => console.error("[AI] Failed to log error:", err.message));
    throw error;
  }
}
var openai = getReplitClient();

// server/services/emarAgent.ts
var emarAgent = {
  async extract(_analysisText, _tableStructure, _correctionsContext, _aiUserContext) {
    throw new Error("emarAgent is not implemented - use standard extraction");
  }
};

// server/routes.ts
var import_multer = __toESM(require("multer"), 1);
var import_pdf_parse = require("pdf-parse");
var import_mammoth = __toESM(require("mammoth"), 1);

// server/services/fileScan.ts
var import_crypto = __toESM(require("crypto"), 1);
var import_cloudmersive_virus_api_client = __toESM(require("cloudmersive-virus-api-client"), 1);
var defaultClient = import_cloudmersive_virus_api_client.default.ApiClient.instance;
var Apikey = defaultClient.authentications["Apikey"];
Apikey.apiKey = process.env.CLOUDMERSIVE_API_KEY;
var apiInstance = new import_cloudmersive_virus_api_client.default.ScanApi();
var scanCache = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
function computeFileHash(buffer) {
  return import_crypto.default.createHash("sha256").update(buffer).digest("hex");
}
function cleanCache() {
  const now = Date.now();
  for (const [hash, entry] of scanCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      scanCache.delete(hash);
    }
  }
}
async function scanFile(metadata) {
  const fileHash = computeFileHash(metadata.buffer);
  cleanCache();
  const cached = scanCache.get(fileHash);
  if (cached) {
    return { ...cached.result, cached: true };
  }
  if (!process.env.CLOUDMERSIVE_API_KEY) {
    console.warn("CLOUDMERSIVE_API_KEY not set - skipping virus scan");
    return {
      isClean: true,
      scanResult: "clean",
      threatsFound: null,
      fileHash,
      cached: false
    };
  }
  return new Promise((resolve, reject) => {
    apiInstance.scanFile(metadata.buffer, (error, data) => {
      if (error) {
        console.error("Cloudmersive scan error:", error);
        reject(new Error(`Virus scan failed: ${error.message || "Unknown error"}`));
        return;
      }
      const isClean = data.CleanResult === true;
      const result = {
        isClean,
        scanResult: isClean ? "clean" : "threat",
        threatsFound: isClean ? null : JSON.stringify(data.FoundViruses || []),
        fileHash,
        cached: false
      };
      scanCache.set(fileHash, { result, timestamp: Date.now() });
      resolve(result);
    });
  });
}

// server/routes.ts
var XLSX = __toESM(require("xlsx"), 1);
var { Pool: Pool2 } = import_pg2.default;
var upload = (0, import_multer.default)({
  storage: import_multer.default.memoryStorage(),
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
var uploadExcel = (0, import_multer.default)({
  storage: import_multer.default.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isExcel = file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.mimetype === "application/vnd.ms-excel" || file.originalname.toLowerCase().endsWith(".xlsx") || file.originalname.toLowerCase().endsWith(".xls");
    const isCSV = file.mimetype === "text/csv" || file.mimetype === "application/csv" || file.originalname.toLowerCase().endsWith(".csv");
    if (isExcel || isCSV) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) or CSV files are allowed"));
    }
  }
});
var MAX_NON_ADMIN_SESSIONS = 2;
var FORCE_LOGOUT_WARNING_SECONDS = 30;
async function scanAndLogFile(file, uploadType, scannedBy) {
  try {
    const scanResult = await scanFile({
      filename: file.originalname,
      size: file.size,
      buffer: file.buffer
    });
    await storage.createFileScanLog({
      fileName: file.originalname,
      fileHash: scanResult.fileHash,
      fileSize: file.size,
      scanResult: scanResult.scanResult,
      threatsFound: scanResult.threatsFound,
      scannedBy: scannedBy || null,
      uploadType,
      cachedResult: scanResult.cached
    });
    if (!scanResult.isClean) {
      console.error(`[SECURITY ALERT] Threat detected in file "${file.originalname}": ${scanResult.threatsFound}. Upload blocked by ${scannedBy || "unknown user"}.`);
      return {
        allowed: false,
        error: `File rejected: Security threat detected. The file "${file.originalname}" contains malware and cannot be uploaded.`
      };
    }
    return { allowed: true };
  } catch (error) {
    console.error("Virus scan error:", error);
    return {
      allowed: false,
      error: `File scan failed: ${error.message}. Please try again later.`
    };
  }
}
var connectedClients = /* @__PURE__ */ new Map();
var sessionStore = null;
var CLINICAL_WHITELIST = /* @__PURE__ */ new Set([
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
  "bright disease"
]);
function isClinicalTerm(phrase) {
  return CLINICAL_WHITELIST.has(phrase.toLowerCase());
}
function scrubPII(data) {
  if (typeof data === "string") {
    let scrubbed = data;
    scrubbed = scrubbed.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, "[REDACTED]");
    scrubbed = scrubbed.replace(/\b(my name is|i am called|i'm called|call me)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*/gi, "$1 [SERVICE USER]");
    scrubbed = scrubbed.replace(/\b([A-Z][a-z]+)'s\b/g, (match, name) => {
      if (isClinicalTerm(name)) return match;
      return "[SERVICE USER]'s";
    });
    scrubbed = scrubbed.replace(/\b([A-Z][a-z]+)\s+((?:O'|Mc|Mac)?[A-Z][a-z]+)(?:\s+((?:O'|Mc|Mac)?[A-Z][a-z]+))?\b/g, (match, first, second, third) => {
      if (isClinicalTerm(match) || isClinicalTerm(first) || isClinicalTerm(second)) {
        return match;
      }
      const commonPhrases = [
        // Care-related terms
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
        // Risk assessment categories
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
        "mobility moving",
        "safeguarding adults",
        "safeguarding children",
        "coshh assessment",
        "manual handling",
        "pressure areas",
        "tissue viability",
        "wound care",
        // Care plan sections
        "initial assessment",
        "care planning",
        "daily living",
        "personal hygiene",
        "oral care",
        "food preparation",
        "medication support",
        "emotional support",
        "social activities",
        // Medical terms
        "blood pressure",
        "heart rate",
        "respiratory rate",
        "oxygen saturation",
        "body temperature",
        "weight management",
        "pain management",
        "symptom control",
        "palliative care",
        // Other common phrases
        "health and safety",
        "dignity and respect",
        "person centred",
        "person centered",
        "best practice",
        "quality assurance",
        "clinical governance",
        "duty of care"
      ];
      if (commonPhrases.includes(match.toLowerCase())) {
        return match;
      }
      return "[SERVICE USER]";
    });
    return scrubbed;
  }
  if (Array.isArray(data)) {
    return data.map((item) => scrubPII(item));
  }
  if (typeof data === "object" && data !== null) {
    const scrubbed = {};
    for (const key of Object.keys(data)) {
      scrubbed[key] = scrubPII(data[key]);
    }
    return scrubbed;
  }
  return data;
}
function normalizeInitials(name) {
  if (!name) return "N.N.";
  const trimmed = name.trim();
  if (/^[A-Z]\.[A-Z]\.?$/i.test(trimmed)) {
    return trimmed.endsWith(".") ? trimmed : trimmed + ".";
  }
  if (trimmed.includes(" ") || trimmed.length > 4) {
    const parts = trimmed.split(/[\s.]+/).filter((p) => p.length > 0);
    if (parts.length >= 2) {
      return parts[0][0].toUpperCase() + "." + parts[parts.length - 1][0].toUpperCase() + ".";
    } else if (parts.length === 1) {
      return parts[0][0].toUpperCase() + ".N.";
    }
  }
  return "N.N.";
}
var drugInteractionCache = /* @__PURE__ */ new Map();
var DRUG_INTERACTION_CACHE_TTL = 24 * 60 * 60 * 1e3;
function getDrugInteractionCacheKey(medications) {
  const medNames = medications.map((m) => m.genericName ? `${m.name.toLowerCase()}|${m.genericName.toLowerCase()}` : m.name.toLowerCase()).sort().join("::");
  return medNames;
}
async function checkDrugInteractions(medications, userContext) {
  if (!medications || medications.length < 2) {
    return [];
  }
  const cacheKey = getDrugInteractionCacheKey(medications);
  const cached = drugInteractionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DRUG_INTERACTION_CACHE_TTL) {
    console.log(`[Drug Interactions] Cache hit for ${medications.length} medications`);
    return cached.result;
  }
  const medList = medications.map(
    (m) => m.genericName ? `${m.name} (${m.genericName})` : m.name
  ).join(", ");
  try {
    const response = await createChatCompletionWithLogging({
      model: "gpt-4.1-mini",
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
    }, "drug_interactions", userContext);
    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    if (parsed.interactions && Array.isArray(parsed.interactions)) {
      const result = parsed.interactions.map((i) => ({
        drug1: i.drug1 || "",
        drug2: i.drug2 || "",
        severity: ["high", "moderate", "low"].includes(i.severity) ? i.severity : "moderate",
        description: i.description || ""
      }));
      drugInteractionCache.set(cacheKey, { result, timestamp: Date.now() });
      console.log(`[Drug Interactions] Cached result for ${medications.length} medications`);
      return result;
    }
    drugInteractionCache.set(cacheKey, { result: [], timestamp: Date.now() });
    return [];
  } catch (error) {
    console.error("[Drug Interactions] Check failed:", error.message);
    return [];
  }
}
function detectTableStructure(text2) {
  const result = {
    hasTable: false,
    columns: [],
    rowCount: 0,
    tableType: "unknown",
    columnBoundaries: [],
    detectedTimeSlots: [],
    detectedDatesOnSameLine: 0
  };
  const lines = text2.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return result;
  const datePattern = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,\s]+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi;
  const shortDatePattern = /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g;
  let maxDatesOnLine = 0;
  let dateHeaderLine = "";
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
  const timeSlotPattern = /\b(\d{1,2}:\d{2})(?:\s*-\s*\d{1,2}:\d{2})?\b/g;
  const allTimeSlots = /* @__PURE__ */ new Set();
  for (const line of lines) {
    let match;
    const lineTimeSlots = [];
    const tempPattern = new RegExp(timeSlotPattern.source, "g");
    while ((match = tempPattern.exec(line)) !== null) {
      lineTimeSlots.push(match[1]);
      allTimeSlots.add(match[1]);
    }
    if (lineTimeSlots.length >= 3) {
      result.columns = lineTimeSlots;
    }
  }
  result.detectedTimeSlots = Array.from(allTimeSlots).sort();
  const spacingPattern = /\s{3,}/g;
  const columnPositions = /* @__PURE__ */ new Map();
  for (const line of lines.slice(0, 50)) {
    let match;
    while ((match = spacingPattern.exec(line)) !== null) {
      const pos = Math.round(match.index / 10) * 10;
      columnPositions.set(pos, (columnPositions.get(pos) || 0) + 1);
    }
  }
  const threshold = Math.max(3, lines.length * 0.3);
  const consistentPositions = Array.from(columnPositions.entries()).filter(([_, count]) => count >= threshold).map(([pos, _]) => pos).sort((a, b) => a - b);
  result.columnBoundaries = consistentPositions;
  if (maxDatesOnLine >= 3 && result.detectedTimeSlots.length >= 2) {
    result.hasTable = true;
    result.tableType = "grid";
  } else if (maxDatesOnLine >= 2 || consistentPositions.length >= 2) {
    result.hasTable = true;
    result.tableType = "grid";
  } else if (result.detectedTimeSlots.length >= 2) {
    result.hasTable = true;
    result.tableType = "list";
  }
  const medicationPattern = /\b\d+\s*(mg|mcg|ml|g|tablet|capsule|patch|spray|unit|iu)s?\b/i;
  let rowCount = 0;
  for (const line of lines) {
    if (medicationPattern.test(line)) {
      rowCount++;
    }
  }
  result.rowCount = rowCount;
  if (dateHeaderLine && maxDatesOnLine >= 2) {
    const dates = dateHeaderLine.match(datePattern) || dateHeaderLine.match(shortDatePattern) || [];
    result.columns = dates.slice(0, 31);
  }
  return result;
}
async function registerRoutes(httpServer2, app2) {
  const wss = new import_ws.WebSocketServer({ server: httpServer2, path: "/ws" });
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
  const sendToUser = (userId, message) => {
    const client = connectedClients.get(userId);
    if (client && client.readyState === import_ws.WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  };
  const forceLogoutUser = async (activeSession) => {
    sendToUser(activeSession.userId, {
      type: "FORCE_LOGOUT_WARNING",
      message: "An administrator needs access. You will be logged out in 30 seconds.",
      seconds: FORCE_LOGOUT_WARNING_SECONDS
    });
    setTimeout(async () => {
      sendToUser(activeSession.userId, {
        type: "FORCE_LOGOUT",
        message: "You have been logged out to allow administrator access."
      });
      if (sessionStore) {
        sessionStore.destroy(activeSession.sessionId, (err) => {
          if (err) console.error("Failed to destroy session:", err);
        });
      }
      await storage.deleteActiveSession(activeSession.sessionId);
    }, FORCE_LOGOUT_WARNING_SECONDS * 1e3);
  };
  const PgSession = (0, import_connect_pg_simple.default)(import_express_session.default);
  const pool = new Pool2({ connectionString: process.env.DATABASE_URL });
  sessionStore = new PgSession({ pool, createTableIfMissing: true });
  app2.set("trust proxy", 1);
  const isReplit = !!process.env.REPL_ID;
  const sessionMiddleware = (0, import_express_session.default)({
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
      maxAge: 1e3 * 60 * 30,
      // 30 minutes - auto logout on inactivity
      partitioned: isReplit
      // Required for third-party cookie access in Chrome's privacy sandbox
    },
    // Type assertion needed for partitioned attribute
    rolling: true
    // Reset cookie expiration on each request (keeps session alive while active)
  });
  app2.use((req, res, next) => {
    if (req.path.startsWith("/vite-hmr")) {
      return next();
    }
    return sessionMiddleware(req, res, next);
  });
  const requireAuth = async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
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
        createdAt: /* @__PURE__ */ new Date(),
        dashboardWidgets: null
      };
      return next();
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.status !== "active") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const activeSession = await storage.getActiveSessionBySessionId(req.sessionID);
    if (!activeSession) {
      req.session.destroy(() => {
      });
      return res.status(401).json({ message: "Session expired" });
    }
    await storage.updateSessionActivity(req.sessionID);
    req.user = user;
    next();
  };
  const requireAdmin = async (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
  };
  const blockDemoWrites = async (req, res, next) => {
    if (req.user?.isDemo) {
      return res.status(403).json({
        message: "Demo mode: Changes are not saved. Sign up to access all features."
      });
    }
    next();
  };
  const getClientIp = (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      return (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",")[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || "unknown";
  };
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const clientIp = getClientIp(req);
      if (clientIp && clientIp !== "unknown") {
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
      if (user.suspendedUntil && new Date(user.suspendedUntil) > /* @__PURE__ */ new Date()) {
        const minutesLeft = Math.ceil((new Date(user.suspendedUntil).getTime() - Date.now()) / 6e4);
        return res.status(403).json({
          message: `Account suspended. Please try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`
        });
      }
      const isAdmin = user.role === "admin";
      const nonAdminCount = await storage.getNonAdminSessionCount();
      let forcingLogout = false;
      if (!isAdmin && nonAdminCount >= MAX_NON_ADMIN_SESSIONS) {
        return res.status(503).json({
          message: `System is at capacity (${MAX_NON_ADMIN_SESSIONS} users). Please try again later.`
        });
      }
      if (isAdmin && nonAdminCount >= MAX_NON_ADMIN_SESSIONS) {
        const nonAdminSessions = await storage.getNonAdminActiveSessions();
        if (nonAdminSessions.length > 0) {
          const oldestSession = nonAdminSessions[0];
          await forceLogoutUser(oldestSession);
          forcingLogout = true;
        }
      }
      req.session.userId = user.id;
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      await storage.createActiveSession({
        userId: user.id,
        username: user.username,
        role: user.role,
        sessionId: req.sessionID,
        ipAddress: clientIp !== "unknown" ? clientIp : null
      });
      await storage.createSessionHistory({
        userId: user.id,
        username: user.username,
        sessionId: req.sessionID,
        ipAddress: clientIp !== "unknown" ? clientIp : null
      });
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
        forcingLogout
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const user = await storage.createUser({
        ...validatedData,
        role: validatedData.role || "staff",
        status: "pending"
      });
      return res.status(201).json({
        message: "Account created. Awaiting admin approval.",
        id: user.id
      });
    } catch (error) {
      if (error instanceof import_zod.z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/auth/me", requireAuth, async (req, res) => {
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
      isDemo: req.user.isDemo || false
    });
  });
  app2.post("/api/auth/accept-terms", requireAuth, async (req, res) => {
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
        termsSignatureDate: signatureDate
      });
    } catch (error) {
      console.error("Error accepting terms:", error);
      return res.status(500).json({ message: "Failed to accept terms" });
    }
  });
  app2.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.sessionID;
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
  app2.get("/api/active-sessions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const sessions = await storage.getAllActiveSessions();
      return res.json({
        sessions: sessions.map((s) => ({
          id: s.id,
          username: s.username,
          role: s.role,
          lastActivity: s.lastActivity,
          createdAt: s.createdAt
        })),
        maxNonAdminSessions: MAX_NON_ADMIN_SESSIONS
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users2 = await storage.getAllUsers();
      return res.json(users2.map((u) => ({
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
        createdAt: u.createdAt
      })));
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/pending", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users2 = await storage.getPendingUsers();
      return res.json(users2.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        jobTitle: u.jobTitle,
        createdAt: u.createdAt
      })));
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const user = await storage.createUser({
        ...validatedData,
        status: "active"
        // Admin-created users are immediately active
      });
      return res.status(201).json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      });
    } catch (error) {
      if (error instanceof import_zod.z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:id/approve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = await storage.updateUserStatus(req.params.id, "active");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      return res.json({ message: "User deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:id/job-title", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { jobTitle } = req.body;
      if (jobTitle === void 0) {
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
        jobTitle: user.jobTitle
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
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
        jobTitle: user.jobTitle
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/users/:id/username", requireAuth, requireAdmin, async (req, res) => {
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
        jobTitle: user.jobTitle
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/sessions/:userId/disconnect", requireAuth, requireAdmin, async (req, res) => {
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
        message: "Your session has been terminated by an administrator."
      });
      await storage.updateSessionLogout(activeSession.sessionId, true);
      await storage.deleteActiveSession(activeSession.sessionId);
      if (sessionStore) {
        sessionStore.destroy(activeSession.sessionId, (err) => {
          if (err) console.error("Failed to destroy session:", err);
        });
      }
      return res.json({ message: "User session disconnected successfully" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const { jobTitle } = req.body;
      if (jobTitle !== void 0) {
        const user = await storage.updateUserJobTitle(req.user.id, jobTitle);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        return res.json({
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          jobTitle: user.jobTitle
        });
      }
      return res.status(400).json({ message: "No valid fields to update" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/auth/password", requireAuth, async (req, res) => {
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
      const bcrypt2 = await import("bcrypt");
      const hashedPassword = await bcrypt2.default.hash(newPassword, 10);
      await storage.updateUserPassword(req.user.id, hashedPassword);
      return res.json({ message: "Password changed successfully" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/admin/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const bcrypt2 = await import("bcrypt");
      const hashedPassword = await bcrypt2.default.hash("test", 10);
      await storage.updateUserPassword(req.params.id, hashedPassword);
      return res.json({ message: `Password reset to 'test' for user ${user.username}` });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/admin/reset-performance-data", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await storage.resetAllPerformanceData();
      return res.json({
        message: "All performance data cleared successfully",
        deleted: result
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats24h();
      const recentAlerts = await storage.getRecentAlerts24h();
      return res.json({ stats, recentAlerts });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/dashboard/widgets", requireAuth, async (req, res) => {
    try {
      const widgets = await storage.getDashboardWidgets(req.user.id);
      return res.json({ widgets: widgets || null });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/dashboard/widgets", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const { widgets } = req.body;
      if (!Array.isArray(widgets)) {
        return res.status(400).json({ message: "widgets must be an array" });
      }
      await storage.updateDashboardWidgets(req.user.id, widgets);
      return res.json({ message: "Dashboard preferences saved", widgets });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/care-workers", requireAuth, async (req, res) => {
    try {
      const workers = await storage.getAllCareWorkers();
      return res.json(workers);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/care-workers", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const validatedData = insertCareWorkerSchema.parse(req.body);
      const worker = await storage.createCareWorker(validatedData);
      return res.status(201).json(worker);
    } catch (error) {
      if (error instanceof import_zod.z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/care-workers/:id", requireAuth, async (req, res) => {
    try {
      const worker = await storage.getCareWorker(req.params.id);
      if (!worker) {
        return res.status(404).json({ message: "Care worker not found" });
      }
      const discrepancies2 = await storage.getDiscrepanciesByCareWorker(req.params.id);
      return res.json({ ...worker, discrepancies: discrepancies2 });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/discrepancies", requireAuth, async (req, res) => {
    try {
      const discrepancies2 = await storage.getAllDiscrepancies();
      return res.json(discrepancies2);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/discrepancies", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const validatedData = insertDiscrepancySchema.parse(req.body);
      const discrepancy = await storage.createDiscrepancy(validatedData);
      const count = await storage.getDiscrepancyCountByType(
        validatedData.careWorkerId,
        validatedData.type
      );
      if (count >= 3) {
        const worker = await storage.getCareWorker(validatedData.careWorkerId);
        if (worker) {
          await storage.createAdminAlert({
            careWorkerId: worker.id,
            careWorkerName: worker.name,
            message: `${worker.name} has reached ${count} discrepancies of type "${validatedData.type}"`,
            discrepancyType: validatedData.type,
            discrepancyCount: count,
            isRead: false
          });
        }
      }
      return res.status(201).json(discrepancy);
    } catch (error) {
      if (error instanceof import_zod.z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/audits", requireAuth, async (req, res) => {
    try {
      const audits2 = await storage.getAllAudits();
      return res.json(audits2);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/audits", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const validatedData = insertAuditSchema.parse(req.body);
      const audit = await storage.createAudit(validatedData);
      return res.status(201).json(audit);
    } catch (error) {
      if (error instanceof import_zod.z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/audits/care-workers", requireAuth, async (req, res) => {
    try {
      const allAudits = await storage.getAllAudits();
      const careWorkerMap = /* @__PURE__ */ new Map();
      for (const audit of allAudits) {
        const results = audit.results;
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
                lastSeen: auditDate
              });
            }
            const stats = careWorkerMap.get(name);
            stats.discrepancyCount++;
            stats.discrepancies.push({
              date: disc.date || auditDate,
              type: "EMAR",
              issue: disc.issue || `${disc.medication}: ${disc.issue || "Issue recorded"}`,
              auditId: audit.id
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
                  lastSeen: auditDate
                });
              }
              const stats = careWorkerMap.get(name);
              stats.auditCount++;
              if (auditDate > stats.lastSeen) stats.lastSeen = auditDate;
              if (!call.compliant) {
                stats.discrepancyCount++;
                stats.discrepancies.push({
                  date: call.date || auditDate,
                  type: "Visit",
                  issue: call.comment || "Non-compliant visit",
                  auditId: audit.id
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
                  lastSeen: auditDate
                });
              }
              const stats = careWorkerMap.get(name);
              stats.discrepancyCount++;
              stats.discrepancies.push({
                date: disc.date || auditDate,
                type: "Visit",
                issue: disc.issue || "Discrepancy recorded",
                auditId: audit.id
              });
              if (auditDate > stats.lastSeen) stats.lastSeen = auditDate;
            }
          }
        }
      }
      const careWorkers2 = Array.from(careWorkerMap.values()).sort((a, b) => b.discrepancyCount - a.discrepancyCount);
      return res.json(careWorkers2);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/admin-alerts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const alerts = await storage.getUnreadAdminAlerts();
      return res.json(alerts);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/admin-alerts/:id/read", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.markAlertAsRead(req.params.id);
      return res.json({ message: "Alert marked as read" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/policy-documents", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getAllPolicyDocuments();
      return res.json(docs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/policy-documents/category/:category", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getPolicyDocumentsByCategory(req.params.category);
      return res.json(docs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/policy-documents", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertPolicyDocumentSchema.parse(req.body);
      const doc = await storage.createPolicyDocument(validatedData);
      return res.status(201).json(doc);
    } catch (error) {
      if (error instanceof import_zod.z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/policy-documents/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const doc = await storage.updatePolicyDocument(req.params.id, req.body);
      if (!doc) {
        return res.status(404).json({ message: "Policy document not found" });
      }
      return res.json(doc);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/policy-documents/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deletePolicyDocument(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/policy-documents/upload", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const user = await storage.getUser(req.session.userId);
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
        const result = await import_mammoth.default.extractRawText({ buffer: req.file.buffer });
        content = result.value;
      } else {
        const parser = new import_pdf_parse.PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        content = result.pages.map((p) => p.text).join("\n");
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
        lastUpdated: /* @__PURE__ */ new Date()
      });
      return res.status(201).json(doc);
    } catch (error) {
      console.error("Policy document upload error:", error);
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/parse-pdf", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const user = await storage.getUser(req.session.userId);
      const scanCheck = await scanAndLogFile(req.file, "parse-pdf", user?.username);
      if (!scanCheck.allowed) {
        return res.status(400).json({ message: scanCheck.error });
      }
      const isDocx = req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || req.file.originalname.toLowerCase().endsWith(".docx");
      let text2 = "";
      if (isDocx) {
        const result = await import_mammoth.default.extractRawText({ buffer: req.file.buffer });
        text2 = result.value;
      } else {
        const parser = new import_pdf_parse.PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        text2 = result.pages.map((p) => p.text).join("\n");
        await parser.destroy();
      }
      res.json({ text: text2 });
    } catch (error) {
      console.error("Document parsing error:", error);
      res.status(500).json({ message: "Failed to parse document" });
    }
  });
  app2.post("/api/ai/analyze-emar", requireAuth, upload.single("file"), async (req, res) => {
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
    const user = await storage.getUser(req.session.userId);
    const scanCheck = await scanAndLogFile(req.file, "emar-analysis", user?.username);
    if (!scanCheck.allowed) {
      return res.status(400).json({ message: scanCheck.error });
    }
    const aiUserContext = { userId: user?.id || null, username: user?.username || null };
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();
    let heartbeatInterval = null;
    heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat

`);
        if (typeof res.flush === "function") res.flush();
      } catch (e) {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    }, 1e4);
    const sendEvent = (eventType, data) => {
      try {
        const padding = `: ${"x".repeat(4096)}

`;
        const payload = `event: ${eventType}
data: ${JSON.stringify(data)}

`;
        res.write(padding + payload);
        if (typeof res.flush === "function") {
          res.flush();
        }
      } catch (e) {
        console.error("[EMAR SSE] Write error:", e);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    };
    const sendProgress = (percent, status, stage) => {
      console.log(`[EMAR SSE] Progress: ${percent}% - ${status}`);
      sendEvent("progress", { percent, status, stage });
    };
    try {
      sendProgress(5, "Processing PDF...", "pdf_processing");
      let documentText = "";
      try {
        const parser = new import_pdf_parse.PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        console.log(`DEBUG: PDF has ${result.pages?.length || 0} pages`);
        if (result.pages && result.pages.length > 0) {
          result.pages.forEach((p, idx) => {
            console.log(`DEBUG: Page ${idx + 1} has ${p.text?.length || 0} chars`);
          });
        }
        if (result.text && result.text.length > 0) {
          documentText = result.text;
          console.log(`DEBUG: Using result.text (combined): ${documentText.length} chars`);
        } else if (result.pages && result.pages.length > 0) {
          documentText = result.pages.map((p) => p.text || "").join("\n\n--- PAGE BREAK ---\n\n");
          console.log(`DEBUG: Using result.pages (joined): ${documentText.length} chars`);
        }
        await parser.destroy();
        console.log(`DEBUG: Final extracted text: ${documentText.length} chars from PDF`);
      } catch (textError) {
        console.error("PDF text extraction failed:", textError);
        sendEvent("error", { message: "Failed to extract text from PDF: " + textError.message });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
      if (documentText.length < 100) {
        sendEvent("error", { message: "PDF appears to be empty or a scanned image. Please upload a text-based PDF document." });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
      const MAX_DOC_TEXT_LENGTH = 2e5;
      const isDocumentTruncated = documentText.length > MAX_DOC_TEXT_LENGTH;
      if (isDocumentTruncated) {
        console.warn(`WARNING: Document text truncated from ${documentText.length} to ${MAX_DOC_TEXT_LENGTH} chars. Some medications may be missed.`);
        sendEvent("warning", {
          message: `Document is very large (${Math.round(documentText.length / 1e3)}K chars). Analyzing first ~200K characters. If medications are missing, try splitting the document.`
        });
      }
      const analysisText = isDocumentTruncated ? documentText.substring(0, MAX_DOC_TEXT_LENGTH) : documentText;
      const imageContent = [];
      const useTextMode = true;
      sendProgress(5, "Pre-analyzing document structure...", "pre_analysis");
      const preAnalysis = {
        dates: [],
        dateCount: 0,
        timeSlots: [],
        medicationLines: 0,
        rawDateMatches: [],
        tableHeaderLines: []
      };
      const datePattern1 = /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[,.]?\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi;
      const datePattern2 = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi;
      const datePattern3 = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
      const lines = analysisText.split(/\r?\n/);
      const foundDates = /* @__PURE__ */ new Set();
      let match;
      const countDatesInLine = (line) => {
        const dates = [];
        const p1 = new RegExp(datePattern1.source, "gi");
        const p2 = new RegExp(datePattern2.source, "gi");
        let m;
        while ((m = p1.exec(line)) !== null) {
          const normalizedDate = `${m[1]}, ${m[2].padStart(2, "0")} ${m[3]}`;
          dates.push(normalizedDate);
        }
        while ((m = p2.exec(line)) !== null) {
          const normalizedDate = `${m[1].padStart(2, "0")} ${m[2]}`;
          const existsInPattern1 = dates.some((d) => d.includes(normalizedDate));
          if (!existsInPattern1) {
            dates.push(normalizedDate);
          }
        }
        return { count: dates.length, dates };
      };
      const tableHeaderLineIndices = [];
      for (let i = 0; i < lines.length; i++) {
        const { count, dates } = countDatesInLine(lines[i]);
        if (count >= 2) {
          tableHeaderLineIndices.push(i);
          preAnalysis.tableHeaderLines.push(lines[i].substring(0, 150) + (lines[i].length > 150 ? "..." : ""));
          dates.forEach((d) => {
            foundDates.add(d);
            preAnalysis.rawDateMatches.push(d);
          });
        }
      }
      if (tableHeaderLineIndices.length === 0) {
        console.log("DEBUG: No multi-date lines found, checking for consecutive date clusters...");
        let clusterStart = -1;
        let clusterDates = [];
        let tempClusterLines = [];
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
            if (clusterStart !== -1 && clusterDates.length >= 3) {
              console.log(`DEBUG: Found date cluster from lines ${clusterStart} to ${i - 1} with ${clusterDates.length} dates`);
              clusterDates.forEach((d) => {
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
        if (clusterStart !== -1 && clusterDates.length >= 3) {
          console.log(`DEBUG: Found date cluster at end with ${clusterDates.length} dates`);
          clusterDates.forEach((d) => {
            foundDates.add(d);
            preAnalysis.rawDateMatches.push(d);
          });
          preAnalysis.tableHeaderLines.push(...tempClusterLines);
        }
      }
      if (foundDates.size === 0) {
        console.log("WARNING: No table header dates detected. Falling back to scanning entire document.");
        while ((match = datePattern1.exec(analysisText)) !== null) {
          const normalizedDate = `${match[1]}, ${match[2].padStart(2, "0")} ${match[3]}`;
          foundDates.add(normalizedDate);
          preAnalysis.rawDateMatches.push(match[0]);
        }
        datePattern2.lastIndex = 0;
        while ((match = datePattern2.exec(analysisText)) !== null) {
          const normalizedDate = `${match[1].padStart(2, "0")} ${match[2]}`;
          const existsInPattern1 = Array.from(foundDates).some((d) => d.includes(normalizedDate));
          if (!existsInPattern1) {
            foundDates.add(normalizedDate);
          }
        }
      }
      preAnalysis.dates = Array.from(foundDates);
      preAnalysis.dateCount = preAnalysis.dates.length;
      const timePattern = /\b(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\b/g;
      const foundTimeSlots = /* @__PURE__ */ new Set();
      while ((match = timePattern.exec(analysisText)) !== null) {
        if (match[2]) {
          foundTimeSlots.add(`${match[1]}-${match[2]}`);
        } else {
          foundTimeSlots.add(match[1]);
        }
      }
      preAnalysis.timeSlots = Array.from(foundTimeSlots).slice(0, 10);
      const medicationLinePattern = /^.*\b(\d+\s*(mg|mcg|ml|g|tablet|capsule|patch|spray|drop|unit|iu)s?)\b.*$/gim;
      const medMatches = analysisText.match(medicationLinePattern);
      preAnalysis.medicationLines = medMatches ? medMatches.length : 0;
      console.log("=== EMAR PRE-ANALYSIS SUMMARY ===");
      console.log(`Dates found (regex): ${preAnalysis.dateCount}`);
      console.log(`Date values: ${preAnalysis.dates.join(", ")}`);
      console.log(`Table header lines identified: ${preAnalysis.tableHeaderLines.length}`);
      if (preAnalysis.tableHeaderLines.length > 0) {
        console.log("Table header samples:");
        preAnalysis.tableHeaderLines.slice(0, 3).forEach((line, i) => {
          console.log(`  ${i + 1}: ${line}`);
        });
      }
      console.log(`Time slots found: ${preAnalysis.timeSlots.length}`);
      console.log(`Medication-like lines: ${preAnalysis.medicationLines}`);
      console.log(`Raw date matches: ${preAnalysis.rawDateMatches.slice(0, 15).join(", ")}`);
      console.log("=================================");
      const tableStructure = detectTableStructure(analysisText);
      console.log("=== TABLE STRUCTURE DETECTION ===");
      console.log(`Has table: ${tableStructure.hasTable}`);
      console.log(`Table type: ${tableStructure.tableType}`);
      console.log(`Dates on same line: ${tableStructure.detectedDatesOnSameLine}`);
      console.log(`Column count: ${tableStructure.columns.length}`);
      if (tableStructure.columns.length > 0) {
        console.log(`Columns: ${tableStructure.columns.slice(0, 10).join(", ")}${tableStructure.columns.length > 10 ? "..." : ""}`);
      }
      console.log(`Detected time slots: ${tableStructure.detectedTimeSlots.join(", ")}`);
      console.log(`Medication row count: ${tableStructure.rowCount}`);
      console.log(`Column boundaries: ${tableStructure.columnBoundaries.join(", ")}`);
      console.log("=================================");
      const recentCorrections = await storage.getRecentEmarCorrections(20);
      let correctionsContext = "";
      if (recentCorrections.length > 0) {
        const correctionExamples = recentCorrections.map((c) => {
          const codeChange = c.correctedCode ? `${c.originalCode || "blank"} \u2192 ${c.correctedCode}` : "no code change";
          return `- "${c.originalMedication}" on ${c.originalDate}: ${codeChange}`;
        }).join("\n");
        correctionsContext = `
LEARN FROM PAST CORRECTIONS:
The following are corrections made to previous extractions. Use these to improve accuracy:
${correctionExamples}
`;
        console.log(`DEBUG: Loaded ${recentCorrections.length} past corrections for AI context`);
      }
      sendProgress(10, "Analyzing EMAR document...", "metadata_extraction");
      const useEmarAgent = process.env.USE_EMAR_AGENT === "true";
      let agentExtractionSucceeded = false;
      let agentExtractedData = null;
      let agentDrugInteractions = [];
      if (useEmarAgent) {
        console.log("=== USING EMAR AGENT (GPT-4o-mini) ===");
        sendProgress(15, "Using cost-efficient EMAR agent...", "emar_agent");
        try {
          const agentResult = await emarAgent.extract(
            analysisText,
            tableStructure,
            correctionsContext,
            aiUserContext
          );
          console.log(`EMAR Agent completed: ${agentResult.entries.length} entries, ${agentResult.consensusStatus}, validation: ${agentResult.validationPassed}`);
          sendProgress(60, `Extracted ${agentResult.entries.length} entries via agent...`, "agent_complete");
          const metadata = agentResult.metadata;
          const allEntries = agentResult.entries.map((e) => ({
            ...e,
            medication: metadata.medications.find((m) => m.medicationId === e.medicationId)?.name || `Medication ${e.medicationId}`
          }));
          sendProgress(62, "Checking for drug interactions...", "drug_interaction_check");
          agentDrugInteractions = await checkDrugInteractions(metadata.medications, aiUserContext);
          if (agentDrugInteractions.length > 0) {
            const highSeverity = agentDrugInteractions.filter((d) => d.severity === "high").length;
            if (highSeverity > 0) {
              sendEvent("warning", {
                message: `ALERT: ${highSeverity} high-severity drug interaction(s) detected. Review medications carefully.`
              });
            }
          }
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
          sendProgress(70, "Analyzing for discrepancies...", "agent_discrepancy_analysis");
          const agentEntries = agentExtractedData.entries;
          const agentMedications = agentExtractedData.medications;
          const agentDates = agentExtractedData.dates;
          const agentTimeSlots = agentExtractedData.timeSlots;
          const agentPrnMeds = /* @__PURE__ */ new Set();
          agentMedications.forEach((m) => {
            if (m.isPRN) agentPrnMeds.add(m.name);
          });
          const agentMedScheduledSlots = /* @__PURE__ */ new Map();
          const agentMedGapHours = /* @__PURE__ */ new Map();
          agentMedications.forEach((m) => {
            const slots = m.scheduledTimeSlots?.length || agentTimeSlots.length;
            agentMedScheduledSlots.set(m.name, slots);
            agentMedGapHours.set(m.name, m.requiredGapHours || 4);
          });
          const agentDiscrepancies = [];
          const agentWarnings = [];
          const reviewCodes = ["R", "PRN-R", "NH", "SA", "F", "FA", "MU"];
          const mainRefusalDiscrepancies = [];
          const prnRefusalDiscrepancies = [];
          const getIssueDescription = (code, isPRN) => {
            const prnPrefix = isPRN ? "(PRN) " : "";
            switch (code) {
              case "R":
              case "PRN-R":
                return `Medication ${prnPrefix}refused by service user`;
              case "NH":
                return `Medication ${prnPrefix}not given - service user not home`;
              case "SA":
                return `Medication ${prnPrefix}self-administered by service user`;
              case "F":
              case "FA":
                return `Medication ${prnPrefix}administered by family member`;
              case "MU":
                return `Medication ${prnPrefix}unavailable`;
              default:
                return `Medication ${prnPrefix}not administered - ${code}`;
            }
          };
          agentEntries.forEach((entry) => {
            const code = (entry.code || "").toUpperCase();
            if (reviewCodes.includes(code)) {
              const isPRN = agentPrnMeds.has(entry.medication) || code.includes("PRN");
              const discrepancy = {
                careWorkerName: entry.careWorkerInitials || "Unknown",
                date: entry.date,
                timeSlot: entry.timeSlot,
                medication: entry.medication,
                code,
                issue: getIssueDescription(code, isPRN),
                severity: "medium",
                actions: { performanceNote: true, meeting: "in_person", referToManager: false }
              };
              if (isPRN) {
                prnRefusalDiscrepancies.push(discrepancy);
              } else {
                mainRefusalDiscrepancies.push(discrepancy);
              }
              agentDiscrepancies.push(discrepancy);
            }
          });
          console.log(`Agent: Found ${mainRefusalDiscrepancies.length} main non-admin codes, ${prnRefusalDiscrepancies.length} PRN non-admin codes`);
          const administrationCodes = ["AD", "AS", "P", "G", "A", "PRN", "PRN-AD", "PRN-AS"];
          const medDateEntriesForGap = /* @__PURE__ */ new Map();
          agentEntries.forEach((entry) => {
            const code = (entry.code || "").toUpperCase();
            if (!administrationCodes.some((c) => code === c || code.startsWith(c))) return;
            if (entry.isOfficeClosed) {
              console.log(`DEBUG: Skipping office-closed entry from time gap check: ${entry.medication} on ${entry.date}`);
              return;
            }
            let timeValue = entry.time;
            if (!timeValue && entry.timeSlot) {
              const timeMatch = entry.timeSlot.match(/(\d{1,2}:\d{2})/);
              if (timeMatch) timeValue = timeMatch[1];
            }
            if (!timeValue) return;
            const dateKey = entry.date.toLowerCase().replace(/[,\s]+/g, "-").substring(0, 10);
            const key = `${entry.medication}|${dateKey}`;
            if (!medDateEntriesForGap.has(key)) medDateEntriesForGap.set(key, []);
            medDateEntriesForGap.get(key).push({
              ...entry,
              extractedTime: timeValue,
              isPRN: agentPrnMeds.has(entry.medication)
            });
          });
          medDateEntriesForGap.forEach((dayEntries, key) => {
            if (dayEntries.length < 2) return;
            const [medication] = key.split("|");
            const scheduledSlots = agentMedScheduledSlots.get(medication) || 1;
            if (scheduledSlots <= 1) return;
            const requiredGap = agentMedGapHours.get(medication) || 4;
            const sorted = dayEntries.sort((a, b) => {
              const [aH, aM] = a.extractedTime.split(":").map(Number);
              const [bH, bM] = b.extractedTime.split(":").map(Number);
              return aH * 60 + aM - (bH * 60 + bM);
            });
            for (let i = 1; i < sorted.length; i++) {
              const prev = sorted[i - 1];
              const curr = sorted[i];
              const [prevH, prevM] = prev.extractedTime.split(":").map(Number);
              const [currH, currM] = curr.extractedTime.split(":").map(Number);
              const gapHours = (currH * 60 + currM - (prevH * 60 + prevM)) / 60;
              if (gapHours <= 0.25 || gapHours < 0) continue;
              if (gapHours < requiredGap - 0.17) {
                agentDiscrepancies.push({
                  careWorkerName: curr.careWorkerInitials || "Unknown",
                  date: curr.date,
                  timeSlot: curr.timeSlot,
                  medication,
                  issue: `Time gap violation: Only ${gapHours.toFixed(1)} hours between doses (required: ${requiredGap}h). Previous: ${prev.extractedTime}, Current: ${curr.extractedTime}`,
                  severity: "high",
                  actions: { performanceNote: true, meeting: "in_person", referToManager: true }
                });
              }
            }
          });
          const muCounts = /* @__PURE__ */ new Map();
          agentEntries.forEach((entry) => {
            if ((entry.code || "").toUpperCase() === "MU") {
              muCounts.set(entry.medication, (muCounts.get(entry.medication) || 0) + 1);
            }
          });
          muCounts.forEach((count, med) => {
            if (count >= 3) {
              agentWarnings.push({
                type: "medication_unavailable_pattern",
                severity: "medium",
                medication: med,
                description: `Medication Unavailable (MU) recorded ${count} times`,
                recommendedAction: "Check if medication has been discontinued or stock issues"
              });
            }
          });
          const groupRefusals = (refusals) => {
            const groups = /* @__PURE__ */ new Map();
            refusals.forEach((d) => {
              const key = `${d.careWorkerName}|${d.medication}`;
              if (!groups.has(key)) {
                groups.set(key, {
                  careWorkerName: d.careWorkerName,
                  medication: d.medication,
                  code: d.code || "",
                  dates: [],
                  count: 0
                });
              }
              const group = groups.get(key);
              group.dates.push({ date: d.date, timeSlot: d.timeSlot, code: d.code || "" });
              group.count++;
            });
            return Array.from(groups.values()).sort((a, b) => b.count - a.count);
          };
          const groupedMainRefusals = groupRefusals(mainRefusalDiscrepancies);
          const groupedPrnRefusals = groupRefusals(prnRefusalDiscrepancies);
          const groupedRefusals = [...groupedMainRefusals, ...groupedPrnRefusals];
          const otherDiscrepancies = agentDiscrepancies.filter(
            (d) => !d.issue.includes("refused")
          );
          const prioritizedDiscrepancies = otherDiscrepancies.sort((a, b) => {
            const getPriority = (issue) => {
              if (issue.includes("Time gap")) return 1;
              if (issue.includes("Missed")) return 2;
              return 3;
            };
            return getPriority(a.issue) - getPriority(b.issue);
          });
          sendProgress(90, "Building analysis result...", "agent_building_result");
          const agentCodeCounts = { AD: 0, AS: 0, P: 0, R: 0 };
          const agentPrnCodeCounts = { PRN: 0, FA: 0, MU: 0, NH: 0, R: 0 };
          agentEntries.forEach((entry) => {
            const code = (entry.code || "").toUpperCase();
            const isPRN = agentPrnMeds.has(entry.medication);
            if (isPRN) {
              if (code === "PRN" || code === "PRN-AD" || code === "PRN-AS") agentPrnCodeCounts.PRN++;
              else if (code === "FA") agentPrnCodeCounts.FA++;
              else if (code === "MU") agentPrnCodeCounts.MU++;
              else if (code === "NH") agentPrnCodeCounts.NH++;
              else if (code === "R" || code === "PRN-R") agentPrnCodeCounts.R++;
            } else {
              if (code === "AD") agentCodeCounts.AD++;
              else if (code === "AS") agentCodeCounts.AS++;
              else if (code === "P") agentCodeCounts.P++;
              else if (code === "R") agentCodeCounts.R++;
            }
          });
          const totalAdminCodes = agentCodeCounts.AD + agentCodeCounts.AS + agentCodeCounts.P;
          let agentServiceUserType = "prompts";
          if (totalAdminCodes > 0) {
            const adRatio = agentCodeCounts.AD / totalAdminCodes;
            const asRatio = agentCodeCounts.AS / totalAdminCodes;
            if (adRatio > 0.6) agentServiceUserType = "full_admin";
            else if (asRatio > 0.4) agentServiceUserType = "assisted";
          }
          const officeClosedEntries = agentEntries.filter((e) => e.isOfficeClosed).map((e) => ({
            medication: e.medication,
            date: e.date,
            timeSlot: e.timeSlot,
            code: e.code,
            closedByStaff: e.closedByStaff || "Office Staff",
            closedTime: e.closedTime || ""
          }));
          console.log(`Agent: Found ${officeClosedEntries.length} office-closed entries`);
          const agentAnalysisResult = {
            serviceUserName: agentExtractedData.serviceUserInitials || "Unknown",
            serviceUserType: agentServiceUserType,
            allergies: agentExtractedData.allergies || "NKDA",
            medicationLevelEvidence: `Code counts (regular): AD=${agentCodeCounts.AD}, AS=${agentCodeCounts.AS}, P=${agentCodeCounts.P}. PRN: PRN=${agentPrnCodeCounts.PRN}, FA=${agentPrnCodeCounts.FA}, MU=${agentPrnCodeCounts.MU}, NH=${agentPrnCodeCounts.NH}, R=${agentPrnCodeCounts.R}. Service level: ${agentServiceUserType.toUpperCase()}.`,
            codeConflictDetected: false,
            codeConflictDetails: null,
            auditPeriodStart: agentDates[0] || "",
            auditPeriodEnd: agentDates[agentDates.length - 1] || "",
            warnings: agentWarnings,
            drugInteractions: agentExtractedData.drugInteractions,
            hasDiscrepancies: agentDiscrepancies.length > 0,
            discrepancies: prioritizedDiscrepancies,
            groupedRefusals,
            groupedMainRefusals,
            groupedPrnRefusals,
            totalRefusalCount: mainRefusalDiscrepancies.length + prnRefusalDiscrepancies.length,
            totalMainRefusalCount: mainRefusalDiscrepancies.length,
            totalPrnRefusalCount: prnRefusalDiscrepancies.length,
            totalOtherDiscrepancyCount: otherDiscrepancies.length,
            userVerificationItems: [],
            prnMedications: {
              hasPRN: agentPrnMeds.size > 0,
              medications: agentMedications.filter((m) => m.isPRN).map((m) => ({
                name: m.name,
                protocol: "PRN protocol should be in place"
              }))
            },
            officeClosedEntries,
            totalEntriesProcessed: agentEntries.length,
            totalMedications: agentMedications.length,
            datesAudited: agentDates,
            timeSlotsFound: agentTimeSlots,
            extractionMethod: "emar-agent",
            validationPasses: 3,
            validationStatus: agentExtractedData.consensusStatus === "verified" ? "completed" : "partial",
            validationEvidence: {},
            initialDiscrepancyCount: agentDiscrepancies.length,
            themesAndTrends: `Agent processed ${agentEntries.length} entries across ${agentMedications.length} medications for ${agentDates.length} days. Consensus: ${agentExtractedData.consensusStatus}. Found ${agentDiscrepancies.length} discrepancies.`,
            gapsInKnowledge: agentDiscrepancies.length > 0 ? "Training needed on: " + Array.from(new Set(agentDiscrepancies.map((d) => {
              if (d.issue.includes("refused")) return "documenting refusal reasons";
              if (d.issue.includes("Time gap")) return "medication timing requirements";
              return "documentation";
            }))).join(", ") : "No significant gaps identified.",
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
              description: agentExtractedData.consensusStatus === "verified" ? "Agent extraction verified with consensus" : "Agent extraction completed (no full consensus)"
            }
          };
          console.log("Agent: Analysis complete -", {
            entries: agentEntries.length,
            discrepancies: agentDiscrepancies.length,
            refusals: mainRefusalDiscrepancies.length + prnRefusalDiscrepancies.length,
            drugInteractions: agentExtractedData.drugInteractions.length
          });
          sendProgress(100, "Analysis complete!", "complete");
          sendEvent("result", agentAnalysisResult);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          return res.end();
        } catch (agentError) {
          console.error("EMAR Agent failed, falling back to standard extraction:", agentError.message);
          sendEvent("warning", { message: "Agent extraction failed, using standard method..." });
          agentExtractionSucceeded = false;
        }
      }
      if (!agentExtractionSucceeded) {
        const tableStructureContext = tableStructure.hasTable ? `
DOCUMENT LAYOUT ANALYSIS:
This document appears to be a ${tableStructure.tableType.toUpperCase()} format EMAR.
- Table detected: YES
- Layout type: ${tableStructure.tableType === "grid" ? "Grid with dates as columns and medications as rows" : "List format with entries on separate lines"}
- ${tableStructure.detectedDatesOnSameLine} dates detected on header line (indicates column structure)
- Time slots found: ${tableStructure.detectedTimeSlots.join(", ")}
- Estimated medication rows: ${tableStructure.rowCount}

Use this layout information to correctly parse the grid structure.
` : "";
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

IMPORTANT: Extract exactly what you see in the text - don't guess or make assumptions.`;
        const DETERMINISTIC_SEED = 42;
        const metadataResponse = await createChatCompletionWithLogging({
          model: getPreferredModel(),
          messages: [
            { role: "system", content: metadataPrompt },
            { role: "user", content: `Analyze this EMAR document and extract the metadata:

${analysisText}` }
          ],
          max_completion_tokens: 4e3,
          temperature: 0,
          seed: DETERMINISTIC_SEED,
          response_format: { type: "json_object" }
        }, "emar_metadata", aiUserContext);
        const metadataContent = metadataResponse.choices[0]?.message?.content || "{}";
        let metadata = {
          serviceUserInitials: "",
          allergies: "",
          medications: [],
          dates: [],
          timeSlots: []
        };
        try {
          metadata = JSON.parse(metadataContent);
          console.log("DEBUG: Metadata extracted -", metadata.medications?.length, "medications,", metadata.dates?.length, "dates,", metadata.timeSlots?.length, "timeSlots");
          sendProgress(15, `Found ${metadata.medications?.length || 0} medications...`, "metadata_complete");
        } catch (e) {
          console.error("Failed to parse metadata JSON:", e);
          console.error("Raw metadata content:", metadataContent);
          sendEvent("error", { message: "Failed to parse medication data from document" });
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          return res.end();
        }
        if (!metadata.medications || metadata.medications.length === 0) {
          console.error("No medications found in metadata");
          sendEvent("error", { message: "No medications found in the document. Please check the PDF contains medication records." });
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          return res.end();
        }
        sendProgress(16, "Checking for drug interactions...", "drug_interaction_check");
        const drugInteractions = await checkDrugInteractions(metadata.medications, aiUserContext);
        if (drugInteractions.length > 0) {
          console.log(`DEBUG: Found ${drugInteractions.length} potential drug interactions`);
          const highSeverity = drugInteractions.filter((d) => d.severity === "high").length;
          if (highSeverity > 0) {
            sendEvent("warning", {
              message: `ALERT: ${highSeverity} high-severity drug interaction(s) detected. Review medications carefully.`
            });
          }
        }
        const aiDateCount = metadata.dates?.length || 0;
        const preParseCount = preAnalysis.dateCount;
        const dateMismatch = Math.abs(aiDateCount - preParseCount);
        console.log("=== DATE VALIDATION ===");
        console.log(`AI detected dates: ${aiDateCount}`);
        console.log(`Pre-parse detected dates: ${preParseCount}`);
        console.log(`Mismatch: ${dateMismatch} dates`);
        if (preParseCount > 0 && dateMismatch > 2) {
          console.warn(`WARNING: AI date count (${aiDateCount}) differs significantly from pre-parsed count (${preParseCount}). Using pre-parsed dates.`);
          metadata.dates = preAnalysis.dates;
          console.log(`Corrected dates to: ${metadata.dates.join(", ")}`);
          sendEvent("warning", {
            message: `Date count corrected: AI detected ${aiDateCount} dates, but document structure shows ${preParseCount} dates. Using validated count.`
          });
        } else if (preParseCount > 0 && aiDateCount !== preParseCount) {
          console.log(`INFO: Minor date count difference (AI: ${aiDateCount}, Pre-parse: ${preParseCount}). Keeping AI dates.`);
        }
        console.log("=== FINAL PRE-ANALYSIS SUMMARY ===");
        console.log(`Document: ${req.file?.originalname || "unknown"}`);
        console.log(`Days in EMAR: ${metadata.dates?.length || 0}`);
        console.log(`Dates: ${(metadata.dates || []).join(", ")}`);
        console.log(`Medications: ${metadata.medications?.length || 0}`);
        for (const med of metadata.medications || []) {
          const slots = med.scheduledTimeSlots?.join(", ") || "all slots";
          console.log(`  - ${med.name}: ${slots}${med.isPRN ? " (PRN)" : ""}`);
        }
        console.log(`Time slots: ${(metadata.timeSlots || []).join(", ")}`);
        console.log("==================================");
        sendProgress(18, "Validating medication count...", "count_validation");
        const runConsensus = async (fn, passes = 3, compareFn = (a, b) => a === b) => {
          const results = [];
          const promises = Array.from({ length: passes }, () => fn());
          const resolved = await Promise.all(promises);
          results.push(...resolved);
          const frequency = /* @__PURE__ */ new Map();
          for (const result2 of results) {
            const key = JSON.stringify(result2);
            if (!frequency.has(key)) {
              frequency.set(key, { value: result2, count: 0 });
            }
            frequency.get(key).count++;
          }
          let bestResult = results[0];
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
        let agreedCount = 0;
        let forceMultiPass = false;
        const expectedEntriesPerMedication = /* @__PURE__ */ new Map();
        const medicationCountPrompt = `Analyze the EMAR document text and count how many DISTINCT medications are listed. Return a JSON object with the count: {"count": 5}`;
        const countMedications = async () => {
          try {
            const response = await createChatCompletionWithLogging({
              model: "gpt-4.1-mini",
              messages: [
                { role: "system", content: medicationCountPrompt },
                { role: "user", content: `Count medications in this document:

${analysisText}` }
              ],
              temperature: 0,
              max_completion_tokens: 100,
              seed: DETERMINISTIC_SEED,
              response_format: { type: "json_object" }
            }, "emar_count_validation", aiUserContext);
            const content = response.choices[0]?.message?.content || '{"count":0}';
            const parsed = JSON.parse(content);
            return parsed.count || 0;
          } catch (e) {
            console.error(`Medication count error:`, e);
            return 0;
          }
        };
        const extractedMedicationCount = metadata.medications?.length || 0;
        const firstCount = await countMedications();
        let agreedMedicationCount = firstCount;
        let medicationCountConsensus = true;
        if (firstCount !== extractedMedicationCount) {
          const secondCount = await countMedications();
          if (secondCount === firstCount) {
            agreedMedicationCount = firstCount;
            console.log(`DEBUG: Medication count confirmed: ${agreedMedicationCount} (2 passes agreed)`);
          } else if (secondCount === extractedMedicationCount) {
            agreedMedicationCount = extractedMedicationCount;
            console.log(`DEBUG: Medication count matches metadata: ${agreedMedicationCount}`);
          } else {
            agreedMedicationCount = extractedMedicationCount;
            medicationCountConsensus = false;
            forceMultiPass = true;
            console.warn(`DEBUG: Medication count mismatch - using metadata: ${extractedMedicationCount}`);
          }
        } else {
          console.log(`DEBUG: Medication count validated on first pass: ${agreedMedicationCount}`);
        }
        sendProgress(25, "Count validation complete...", "count_complete");
        const medicationsWithIds = (metadata.medications || []).map((m, i) => ({
          ...m,
          medicationId: i + 1
          // 1-indexed for easier human readability
        }));
        const batchSize = 3;
        const medicationBatches = [];
        for (let i = 0; i < medicationsWithIds.length; i += batchSize) {
          medicationBatches.push(medicationsWithIds.slice(i, i + batchSize));
        }
        console.log(`DEBUG: Processing ${medicationsWithIds.length} medications in ${medicationBatches.length} batches (${batchSize} per batch)`);
        sendProgress(30, `Processing ${medicationsWithIds.length} medications in ${medicationBatches.length} batches...`, "extraction_start");
        const TIME_REGEX = /^(?:(?:0?[0-9]|1[0-9]|2[0-3])[:.]?[0-5][0-9]|(?:0?[0-9]|1[0-2])[:.]?[0-5][0-9]\s*(?:am|pm|AM|PM))$/;
        const computeHasTime = (entry) => {
          if (typeof entry.hasTime === "boolean") {
            return entry.hasTime;
          }
          const timeStr = String(entry.time || "").trim();
          if (timeStr === "" || timeStr === "-" || timeStr === "--" || timeStr.toLowerCase() === "n/a" || timeStr.toLowerCase() === "na" || timeStr.toLowerCase() === "null" || timeStr === "0") {
            return false;
          }
          return TIME_REGEX.test(timeStr);
        };
        const normalizeEntries = (entries) => {
          return entries.map((e) => {
            let timeSlot = (e.timeSlot || "").trim().toUpperCase();
            timeSlot = timeSlot.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
            let date = (e.date || "").trim().toUpperCase();
            return {
              medicationId: Number(e.medicationId) || 0,
              date,
              timeSlot,
              code: (e.code || "").toUpperCase().trim(),
              careWorkerInitials: (e.careWorkerInitials || "").toUpperCase().trim(),
              hasTime: computeHasTime(e),
              // Include hasTime for PRN consensus
              time: e.time
              // Preserve original time field
            };
          }).sort((a, b) => {
            if (a.medicationId !== b.medicationId) return a.medicationId - b.medicationId;
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.timeSlot !== b.timeSlot) return a.timeSlot.localeCompare(b.timeSlot);
            return a.code.localeCompare(b.code);
          });
        };
        const hashEntries = (entries) => {
          const normalized = normalizeEntries(entries);
          return JSON.stringify(normalized);
        };
        const hashSingleEntry = (entry) => {
          let timeSlot = (entry.timeSlot || "").trim().toUpperCase();
          timeSlot = timeSlot.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
          let date = (entry.date || "").trim().toUpperCase();
          const normalized = {
            medicationId: Number(entry.medicationId) || 0,
            date,
            timeSlot,
            code: (entry.code || "").toUpperCase().trim(),
            careWorkerInitials: (entry.careWorkerInitials || "").toUpperCase().trim(),
            hasTime: computeHasTime(entry)
            // Use shared helper for consistency
          };
          return JSON.stringify(normalized);
        };
        const deduplicateEntries = (entries) => {
          const seenKeys = /* @__PURE__ */ new Set();
          return entries.filter((entry) => {
            const key = `${entry.medicationId}-${entry.date}-${entry.timeSlot}`;
            if (seenKeys.has(key)) {
              return false;
            }
            seenKeys.add(key);
            return true;
          });
        };
        const runExtractionPass = async (passNumber) => {
          console.log(`DEBUG: Starting text extraction pass ${passNumber}`);
          const batchPromises = medicationBatches.map(async (batch, batchIndex) => {
            const batchMedList = batch.map(
              (m) => `[ID:${m.medicationId}] ${m.name}${m.isPRN ? " (PRN)" : ""}`
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
    {"medicationId": ${batch[0].medicationId}, "date": "Sun, 07 Dec", "timeSlot": "08:00-09:00", "code": "AS", "careWorkerInitials": "MANUAL", "time": "", "hasTime": false, "isOfficeClosed": true}
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
4. Skip only truly blank/empty cells - but capture ALL cells with any code or initials
5. IGNORE RED COLORING when a code is present - if a time slot shows red but contains a valid code (AD, AS, R, etc.), follow the code not the color. Red color is often used just for visual emphasis.

MANUAL CODE ENTRY DETECTION (CRITICAL):
- If a cell contains ONLY a code (AS, AD, P, R, etc.) with NO time and NO other initials, this is a MANUALLY ENTERED CODE by office staff
- In this case:
  1. Set careWorkerInitials to "MANUAL" (not the code itself!)
  2. Set isOfficeClosed to true
- Example: Cell shows just "AS" \u2192 code: "AS", careWorkerInitials: "MANUAL", hasTime: false, isOfficeClosed: true
- Example: Cell shows "JH 08:41 AS" \u2192 code: "AS", careWorkerInitials: "JH", time: "08:41", hasTime: true, isOfficeClosed: false
- DO NOT confuse medication codes (AS, AD, P, R, MU, NH, SA, FA, PRN) for care worker initials - MEDICATION CODES ARE NEVER INITIALS!`;
            try {
              const response = await createChatCompletionWithLogging({
                model: getPreferredModel(),
                messages: [
                  { role: "system", content: batchPrompt },
                  { role: "user", content: `Extract medication entries from this document:

${analysisText}` }
                ],
                temperature: 0,
                max_completion_tokens: 8e3,
                seed: DETERMINISTIC_SEED,
                response_format: { type: "json_object" }
              }, "emar_extraction", aiUserContext);
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
        console.log("DEBUG: Running 3-pass parallel text extraction");
        sendProgress(35, "Extracting medication records...", "extraction_running");
        const [pass1Entries, pass2Entries, pass3Entries] = await Promise.all([
          runExtractionPass(1),
          runExtractionPass(2),
          runExtractionPass(3)
        ]);
        let extractedEntries = pass1Entries;
        let consensusStatus = "single_pass";
        let consensusDetails = {
          pass1Count: pass1Entries.length,
          pass2Count: pass2Entries.length,
          pass3Count: pass3Entries.length,
          matchingPasses: []
          // Will be populated based on actual consensus
        };
        console.log(`DEBUG: Pass counts - P1: ${pass1Entries.length}, P2: ${pass2Entries.length}, P3: ${pass3Entries.length}`);
        const validMedicationIds = new Set(medicationsWithIds.map((m) => m.medicationId));
        const validCodes = /* @__PURE__ */ new Set(["AD", "AS", "P", "PRN", "PRN-R", "R", "MU", "NH", "SA", "FA", "MISSED"]);
        const validDates = new Set((metadata.dates || []).map((d) => d.toLowerCase().trim()));
        const validTimeSlots = new Set((metadata.timeSlots || []).map((t) => t.toLowerCase().trim()));
        const normalizeForComparison = (str) => str.toLowerCase().trim().replace(/\s+/g, " ");
        const validatePassEntries = (entries) => {
          const validEntries = entries.filter((e) => {
            if (!e.medicationId || !e.date || !e.timeSlot || !e.code) return false;
            if (typeof e.medicationId !== "number") return false;
            if (typeof e.date !== "string") return false;
            if (typeof e.timeSlot !== "string") return false;
            if (typeof e.code !== "string") return false;
            if (!validMedicationIds.has(e.medicationId)) return false;
            if (!validCodes.has(e.code.toUpperCase())) return false;
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
        const passQualityGates = (validatedEntries) => {
          const hasEntries = validatedEntries.length > 0;
          const countOK = agreedCount === 0 || Math.abs(validatedEntries.length - agreedCount) <= Math.max(5, agreedCount * 0.1);
          return hasEntries && countOK;
        };
        const p1Validation = validatePassEntries(pass1Entries);
        const p2Validation = validatePassEntries(pass2Entries);
        const p3Validation = validatePassEntries(pass3Entries);
        console.log(`DEBUG: Valid entries - P1: ${p1Validation.validEntries.length}, P2: ${p2Validation.validEntries.length}, P3: ${p3Validation.validEntries.length}`);
        const entryPassVotes = /* @__PURE__ */ new Map();
        const allPassValidations = [
          { passNum: 1, entries: p1Validation.validEntries },
          { passNum: 2, entries: p2Validation.validEntries },
          { passNum: 3, entries: p3Validation.validEntries }
        ];
        for (const passData of allPassValidations) {
          for (const entry of passData.entries) {
            const hash = hashSingleEntry(entry);
            if (!entryPassVotes.has(hash)) {
              entryPassVotes.set(hash, { passIds: /* @__PURE__ */ new Set(), entry });
            }
            entryPassVotes.get(hash).passIds.add(passData.passNum);
          }
        }
        const consensusEntries = [];
        const singlePassEntries = [];
        entryPassVotes.forEach(({ passIds, entry }, hash) => {
          if (passIds.size >= 2) {
            consensusEntries.push(entry);
          } else {
            singlePassEntries.push(entry);
          }
        });
        console.log(`DEBUG: Per-entry consensus - 2+ passes: ${consensusEntries.length}, Single pass: ${singlePassEntries.length}`);
        const refusalCodes = /* @__PURE__ */ new Set(["R", "MU", "NH", "FA", "SA", "PRN-R", "MISSED"]);
        if (singlePassEntries.length > 0) {
          console.log(`DEBUG: Including ALL ${singlePassEntries.length} single-pass entries to maximize data capture`);
        }
        const maxPassCount = Math.max(p1Validation.validEntries.length, p2Validation.validEntries.length, p3Validation.validEntries.length);
        const consensusRatio = maxPassCount > 0 ? consensusEntries.length / maxPassCount : 0;
        console.log(`DEBUG: Consensus ratio: ${consensusEntries.length}/${maxPassCount} = ${(consensusRatio * 100).toFixed(1)}%`);
        const passResults = [
          { pass: 1, entries: p1Validation.validEntries, meetsGates: passQualityGates(p1Validation.validEntries) },
          { pass: 2, entries: p2Validation.validEntries, meetsGates: passQualityGates(p2Validation.validEntries) },
          { pass: 3, entries: p3Validation.validEntries, meetsGates: passQualityGates(p3Validation.validEntries) }
        ];
        console.log(`DEBUG: Quality gates - P1: ${passResults[0].meetsGates}, P2: ${passResults[1].meetsGates}, P3: ${passResults[2].meetsGates}`);
        if (p1Validation.validEntries.length > 0 || p2Validation.validEntries.length > 0 || p3Validation.validEntries.length > 0) {
          const gatedPasses = passResults.filter((p) => p.meetsGates).sort((a, b) => b.entries.length - a.entries.length);
          const sortedByCount = [...passResults].sort((a, b) => b.entries.length - a.entries.length);
          const championPass = gatedPasses.length > 0 ? gatedPasses[0] : sortedByCount[0];
          const otherPasses = passResults.filter((p) => p.pass !== championPass.pass);
          console.log(`DEBUG: Champion pass ${championPass.pass} (gates: ${championPass.meetsGates}, count: ${championPass.entries.length})`);
          const getSlotKey = (e) => `${e.medicationId}|${(e.date || "").toLowerCase().trim()}|${(e.timeSlot || "").toLowerCase().trim()}`;
          const isRefusalCode = (code) => refusalCodes.has((code || "").toUpperCase());
          const championBySlot = /* @__PURE__ */ new Map();
          const championSlotKeys = /* @__PURE__ */ new Set();
          for (const entry of championPass.entries) {
            const key = getSlotKey(entry);
            championBySlot.set(key, entry);
            championSlotKeys.add(key);
          }
          let addedFromOthers = 0;
          let refusalOverrides = 0;
          for (const otherPass of otherPasses) {
            for (const entry of otherPass.entries) {
              const key = getSlotKey(entry);
              const existing = championBySlot.get(key);
              if (!existing) {
                championBySlot.set(key, entry);
                addedFromOthers++;
              } else if (isRefusalCode(entry.code) && !isRefusalCode(existing.code)) {
                championBySlot.set(key, entry);
                refusalOverrides++;
                console.log(`DEBUG: Refusal override at slot ${key}: ${existing.code} -> ${entry.code}`);
              }
            }
          }
          let addedFromSinglePass = 0;
          for (const singleEntry of singlePassEntries) {
            const key = getSlotKey(singleEntry);
            if (championSlotKeys.has(key)) continue;
            const existing = championBySlot.get(key);
            if (!existing) {
              championBySlot.set(key, singleEntry);
              addedFromSinglePass++;
            } else if (isRefusalCode(singleEntry.code) && !isRefusalCode(existing.code)) {
              championBySlot.set(key, singleEntry);
              refusalOverrides++;
            }
          }
          extractedEntries = Array.from(championBySlot.values());
          const actualMatchingPasses = [];
          entryPassVotes.forEach(({ passIds }) => {
            if (passIds.size >= 2) {
              passIds.forEach((pid) => {
                if (!actualMatchingPasses.includes(pid)) actualMatchingPasses.push(pid);
              });
            }
          });
          actualMatchingPasses.sort((a, b) => a - b);
          const hasConflicts = addedFromOthers > 0 || refusalOverrides > 0 || addedFromSinglePass > 0;
          console.log(`DEBUG: Champion pass ${championPass.pass}: ${championPass.entries.length} base + ${addedFromOthers} from other passes + ${addedFromSinglePass} single-pass + ${refusalOverrides} refusal overrides = ${extractedEntries.length} total`);
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
          consensusStatus = "no_consensus";
          consensusDetails.matchingPasses = [];
          extractedEntries = [];
          consensusDetails.fallbackPassUsed = 0;
          consensusDetails.escalationReason = "CRITICAL: All extraction passes failed validation - manual document review required";
          console.log(`DEBUG: CRITICAL - all passes failed validation`);
        }
        sendProgress(65, "Extraction complete...", "extraction_complete");
        console.log(`DEBUG: Extraction result: ${consensusStatus}, using ${extractedEntries.length} entries`);
        let prnRefusalCount = 0;
        extractedEntries = extractedEntries.map((entry) => {
          const code = (entry.code || "").toUpperCase();
          const isPrnMed = medicationsWithIds.some(
            (m) => m.medicationId === entry.medicationId && m.isPRN === true
          );
          const hasTime = computeHasTime(entry);
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
        const actualEntriesPerMedication = /* @__PURE__ */ new Map();
        for (const entry of extractedEntries) {
          const medId = Number(entry.medicationId) || 0;
          actualEntriesPerMedication.set(medId, (actualEntriesPerMedication.get(medId) || 0) + 1);
        }
        console.log(`DEBUG: ===== PER-MEDICATION SANITY CHECK =====`);
        let totalDiscrepancyCount = 0;
        for (const [medId, expectedCount] of Array.from(expectedEntriesPerMedication.entries())) {
          const actualCount = actualEntriesPerMedication.get(medId) || 0;
          const medication = medicationsWithIds.find((m) => m.medicationId === medId);
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
        extractedCount = extractedEntries.length;
        if (agreedCount === 0) {
          countValidationMatch = false;
          console.log("DEBUG: Count validation FAILED - no agreed count available (agreedCount=0)");
        } else if (extractedCount === agreedCount) {
          countValidationMatch = true;
          console.log(`DEBUG: Count validation PASSED - extracted ${extractedCount} matches expected ${agreedCount}`);
        } else {
          countValidationMatch = false;
          console.log(`DEBUG: Count validation FAILED - extracted ${extractedCount} vs expected ${agreedCount}`);
        }
        const extractedData = {
          serviceUserInitials: metadata.serviceUserInitials,
          allergies: metadata.allergies,
          medications: medicationsWithIds,
          entries: extractedEntries,
          dates: metadata.dates,
          timeSlots: metadata.timeSlots
        };
        const medIdToDetails = /* @__PURE__ */ new Map();
        medicationsWithIds.forEach((m) => {
          medIdToDetails.set(m.medicationId, m);
        });
        const nonPrnMedsList = metadata.medications?.filter((m) => !m.isPRN) || [];
        const prnMedsList = metadata.medications?.filter((m) => m.isPRN) || [];
        const expectedNonPrnEntries = nonPrnMedsList.length * (metadata.dates?.length || 0) * (metadata.timeSlots?.length || 0);
        const actualEntriesCount = extractedEntries.length;
        const expectedEntriesCount = expectedNonPrnEntries;
        console.log(`DEBUG: Grid structure - ${metadata.medications?.length || 0} meds (${nonPrnMedsList.length} regular, ${prnMedsList.length} PRN), ${metadata.dates?.length || 0} dates, ${metadata.timeSlots?.length || 0} timeSlots`);
        console.log(`DEBUG: Expected non-PRN entries: ${expectedNonPrnEntries}, Actual entries extracted: ${extractedEntries.length}`);
        const dbCareWorkers = await storage.getAllCareWorkers();
        const initialsToName = /* @__PURE__ */ new Map();
        dbCareWorkers.forEach((cw) => {
          const nameParts = cw.name.split(/[\s.]+/).filter((p) => p.length > 0);
          const initials = nameParts.map((p) => p[0].toUpperCase()).join("");
          initialsToName.set(initials, cw.name);
          if (nameParts.length >= 2) {
            const twoLetterInitials = nameParts[0][0].toUpperCase() + nameParts[nameParts.length - 1][0].toUpperCase();
            initialsToName.set(twoLetterInitials, cw.name);
          }
        });
        console.log("DEBUG: Care worker initials map:", Object.fromEntries(initialsToName));
        const unknownInitials = /* @__PURE__ */ new Set();
        const allEntries = (extractedData.entries || []).map((entry) => {
          const initials = (entry.careWorkerInitials || "").toUpperCase();
          let careWorkerValue = initials;
          if (initials === "MANUAL") {
            careWorkerValue = "Manual Entry";
          } else if (initials && initials.length > 0) {
            const fullName = initialsToName.get(initials);
            if (fullName) {
              careWorkerValue = fullName;
            } else {
              unknownInitials.add(initials);
            }
          }
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
        if (unknownInitials.size > 0) {
          console.log("DEBUG: Unknown care worker initials (not in database):", Array.from(unknownInitials));
        }
        const allDates = extractedData.dates || [];
        const timeSlots = extractedData.timeSlots || [];
        let medications = extractedData.medications || [];
        const allergies = extractedData.allergies || "";
        const normalizeMedName = (name) => {
          return (name || "").toLowerCase().trim().replace(/\s+/g, " ");
        };
        const medByNormalizedName = /* @__PURE__ */ new Map();
        const oldIdToCanonicalId = /* @__PURE__ */ new Map();
        medications.forEach((med) => {
          const normalizedName = normalizeMedName(med.name);
          if (!medByNormalizedName.has(normalizedName)) {
            medByNormalizedName.set(normalizedName, med);
            oldIdToCanonicalId.set(med.medicationId, med.medicationId);
          } else {
            const canonicalMed = medByNormalizedName.get(normalizedName);
            oldIdToCanonicalId.set(med.medicationId, canonicalMed.medicationId);
          }
        });
        const originalMedCount = medications.length;
        medications = Array.from(medByNormalizedName.values());
        const deduplicatedMedCount = medications.length;
        if (originalMedCount !== deduplicatedMedCount) {
          console.log(`DEBUG: Medication deduplication - reduced from ${originalMedCount} to ${deduplicatedMedCount} unique medications`);
          console.log("DEBUG: ID remapping:", Object.fromEntries(oldIdToCanonicalId));
        }
        allEntries.forEach((entry) => {
          const canonicalId = oldIdToCanonicalId.get(entry.medicationId);
          if (canonicalId !== void 0 && canonicalId !== entry.medicationId) {
            entry.medicationId = canonicalId;
            const canonicalMed = Array.from(medByNormalizedName.values()).find((m) => m.medicationId === canonicalId);
            if (canonicalMed) {
              entry.medication = canonicalMed.name;
            }
          }
        });
        medIdToDetails.clear();
        medications.forEach((med) => {
          medIdToDetails.set(med.medicationId, {
            name: med.name,
            strength: med.strength || "",
            form: med.form || "",
            isPRN: med.isPRN || false
          });
        });
        console.log("DEBUG: Extracted", allEntries.length, "entries,", allDates.length, "dates,", timeSlots.length, "time slots,", medications.length, "unique medications");
        sendProgress(75, "Detecting discrepancies...", "discrepancy_detection");
        const discrepancies2 = [];
        const verificationItems = [];
        const warnings = [];
        const PRN_KEYWORDS = [
          "as required",
          "as needed",
          "when required",
          "when needed",
          "take up to",
          "if needed",
          "if required",
          "when necessary"
        ];
        const isPRNFromInstructions = (instructions) => {
          if (!instructions) return false;
          const lower = instructions.toLowerCase();
          if (/\bprn\b/i.test(instructions)) return true;
          if (PRN_KEYWORDS.some((keyword) => lower.includes(keyword))) return true;
          if (/up to \d+\s*(times|tablets?|capsules?|doses?|daily|a day)/i.test(instructions)) return true;
          return false;
        };
        const prnMeds = /* @__PURE__ */ new Set();
        const prnMedIds = /* @__PURE__ */ new Set();
        const medGenericNames = /* @__PURE__ */ new Map();
        const medGapHours = /* @__PURE__ */ new Map();
        const medTimeSlots = /* @__PURE__ */ new Map();
        const medScheduledSlotCount = /* @__PURE__ */ new Map();
        medications.forEach((med) => {
          const validatedIsPRN = isPRNFromInstructions(med.instructions);
          if (med.isPRN !== validatedIsPRN) {
            console.log(`DEBUG: PRN validation override for "${med.name}": AI said isPRN=${med.isPRN}, instructions say isPRN=${validatedIsPRN}`);
            med.isPRN = validatedIsPRN;
          }
          if (med.isPRN) {
            prnMeds.add(med.name);
            prnMedIds.add(med.medicationId);
          }
          if (med.genericName) medGenericNames.set(med.name, med.genericName.toLowerCase());
          if (med.requiredGapHours) medGapHours.set(med.name, med.requiredGapHours);
          if (med.timeSlots) medTimeSlots.set(med.name, med.timeSlots);
          const slotCount = med.scheduledTimeSlots?.length || med.timeSlots?.length || 1;
          medScheduledSlotCount.set(med.name, slotCount);
        });
        const allergyLower = allergies.toLowerCase();
        if (!allergyLower.includes("no known") && !allergyLower.includes("nkda") && allergies.trim() !== "") {
          const allergyList = allergies.split(/[,;]|\band\b/i).map((a) => a.trim().toLowerCase()).filter((a) => a.length > 2);
          medications.forEach((med) => {
            const medLower = med.name.toLowerCase();
            const genericLower = (med.genericName || "").toLowerCase();
            allergyList.forEach((allergy) => {
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
        const genericToMeds = /* @__PURE__ */ new Map();
        medications.forEach((med) => {
          const generic = (med.genericName || "").toLowerCase();
          if (generic) {
            if (!genericToMeds.has(generic)) genericToMeds.set(generic, []);
            genericToMeds.get(generic).push(med.name);
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
        const medNameCounts = /* @__PURE__ */ new Map();
        medications.forEach((med) => {
          const baseName = med.name.split(/\d/)[0].trim().toLowerCase();
          medNameCounts.set(baseName, (medNameCounts.get(baseName) || 0) + 1);
        });
        medNameCounts.forEach((count, baseName) => {
          if (count > 1) {
            const matchingMeds = medications.filter(
              (m) => m.name.toLowerCase().startsWith(baseName)
            ).map((m) => m.name);
            warnings.push({
              type: "duplicate_medication_entry",
              severity: "high",
              medication: matchingMeds.join(", "),
              description: `Medication "${baseName}" appears ${count} times with potentially different instructions`,
              recommendedAction: "Review EMAR setup - may indicate system error or prescribing issue"
            });
          }
        });
        if (medications.length >= 2) {
          sendProgress(52, "Checking for medication equivalences...", "medication_equivalence_check");
          const medNames = medications.map((m) => m.name).join(", ");
          try {
            const equivalenceResponse = await createChatCompletionWithLogging({
              model: "gpt-4.1-mini",
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
              max_completion_tokens: 1e3,
              response_format: { type: "json_object" }
            }, "emar_equivalence", aiUserContext);
            const equivalenceContent = equivalenceResponse.choices[0]?.message?.content || "{}";
            const equivalenceData = JSON.parse(equivalenceContent);
            if (equivalenceData.equivalences && Array.isArray(equivalenceData.equivalences)) {
              equivalenceData.equivalences.forEach((eq2) => {
                if (eq2.medications && eq2.medications.length >= 2) {
                  warnings.push({
                    type: "medication_equivalence",
                    severity: "high",
                    medication: eq2.medications.join(", "),
                    description: `WARNING: ${eq2.medications.join(" and ")} appear to be the same medication (${eq2.activeIngredient}). ${eq2.explanation}`,
                    recommendedAction: "Review prescription - possible duplicate. Verify with prescriber if this is intentional (e.g., different release forms)."
                  });
                }
              });
            }
            console.log(`DEBUG: Medication equivalence check found ${equivalenceData.equivalences?.length || 0} potential duplicates`);
          } catch (eqError) {
            console.error("Medication equivalence check error:", eqError);
          }
        }
        const codeCounts = { AD: 0, AS: 0, P: 0 };
        const prnCodeCounts = { PRN: 0, "PRN-R": 0, FA: 0, MU: 0, NH: 0, R: 0 };
        allEntries.forEach((entry) => {
          const code = (entry.code || "").toUpperCase();
          const isPrnMed = prnMedIds.has(entry.medicationId);
          if (isPrnMed) {
            if (code === "PRN") prnCodeCounts.PRN++;
            if (code === "PRN-R") prnCodeCounts["PRN-R"]++;
            if (code === "FA") prnCodeCounts.FA++;
            if (code === "MU") prnCodeCounts.MU++;
            if (code === "NH") prnCodeCounts.NH++;
            if (code === "R") prnCodeCounts.R++;
          } else {
            if (code === "AD") codeCounts.AD++;
            if (code === "AS") codeCounts.AS++;
            if (code === "P") codeCounts.P++;
          }
        });
        let serviceUserType = "administer";
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
        const entryMedIds = new Set(allEntries.map((e) => e.medicationId));
        console.log("DEBUG: Entry medicationIds:", Array.from(entryMedIds));
        console.log("DEBUG: Medication IDs in metadata:", medications.map((m) => `${m.medicationId}:${m.name}`).slice(0, 5));
        const extractedKeys = /* @__PURE__ */ new Set();
        allEntries.forEach((entry) => {
          const key = `${entry.medicationId}|${entry.date}|${entry.timeSlot}`;
          extractedKeys.add(key);
        });
        console.log("DEBUG: Extracted keys count:", extractedKeys.size);
        let filledCells = 0;
        let callCancelledCount = 0;
        medications.forEach((med) => {
          if (med.isPRN) return;
          const medId = med.medicationId;
          const medScheduledSlots = med.scheduledTimeSlots && med.scheduledTimeSlots.length > 0 ? med.scheduledTimeSlots : timeSlots;
          allDates.forEach((date) => {
            medScheduledSlots.forEach((slot) => {
              const key = `${medId}|${date}|${slot}`;
              if (extractedKeys.has(key)) {
                filledCells++;
              } else {
                callCancelledCount++;
              }
            });
          });
        });
        console.log(`DEBUG: Grid statistics - ${filledCells} filled cells, ${callCancelledCount} call cancelled (blank cells are NOT discrepancies)`);
        allEntries.forEach((entry) => {
          const code = (entry.code || "").toUpperCase();
          const careWorker = entry.careWorker || "";
          const date = entry.date || "";
          const timeSlot = entry.timeSlot || "";
          const medication = entry.medication || "";
          const isPRN = prnMeds.has(medication);
          if (code === "R" || code === "PRN-R") {
            const isPrnRefusal = code === "PRN-R";
            discrepancies2.push({
              careWorkerName: careWorker,
              date,
              timeSlot,
              medication,
              code,
              // "R" or "PRN-R" for refusal grouping filter
              issue: isPrnRefusal ? "PRN medication refused (PRN-R) - requires documented reason" : "Medication refused (R) - requires documented reason",
              severity: "high",
              actions: { performanceNote: true, meeting: "phone", referToManager: false }
            });
            verificationItems.push({
              careWorkerName: careWorker,
              date,
              medication,
              code,
              note: isPrnRefusal ? "Check if PRN refusal reason is documented and acceptable" : "Check if refusal reason is documented and acceptable"
            });
          }
          if (code === "MISSED") {
            discrepancies2.push({
              careWorkerName: "Unknown",
              date,
              timeSlot,
              medication,
              issue: "Missed medication - red/highlighted blank box indicates medication was not given",
              severity: "high",
              actions: { performanceNote: true, meeting: "phone", referToManager: true }
            });
          }
          if (code === "MU") {
            verificationItems.push({
              careWorkerName: careWorker,
              date,
              medication,
              code: "MU",
              note: "Check if medication unavailability is documented and escalated"
            });
          }
          if (code === "NH") {
            verificationItems.push({
              careWorkerName: careWorker,
              date,
              medication,
              code: "NH",
              note: "Check if not home status is documented"
            });
          }
          if (code === "SA") {
            verificationItems.push({
              careWorkerName: careWorker,
              date,
              medication,
              code: "SA",
              note: "Check if self-administration was appropriate and witnessed"
            });
          }
          if (code === "FA") {
            verificationItems.push({
              careWorkerName: careWorker,
              date,
              medication,
              code: "FA",
              note: "Check if family administration is documented and appropriate"
            });
          }
          const PRN_CODES = ["PRN", "PRN-AD", "PRN-AS", "PRN-R"];
          if (PRN_CODES.includes(code) && !isPRN) {
            discrepancies2.push({
              careWorkerName: careWorker,
              date,
              timeSlot,
              medication,
              code,
              issue: `PRN code "${code}" used on regular medication - "${medication}" is not prescribed as PRN`,
              severity: "high",
              actions: { performanceNote: true, meeting: "phone", referToManager: true }
            });
          }
          const INVALID_PRN_CODES = ["AD", "AS", "P"];
          if (INVALID_PRN_CODES.includes(code) && isPRN) {
            discrepancies2.push({
              careWorkerName: careWorker,
              date,
              timeSlot,
              medication,
              code,
              issue: `Invalid code "${code}" used on PRN medication - should use PRN codes (PRN, PRN-AD, PRN-AS, PRN-R)`,
              severity: "high",
              actions: { performanceNote: true, meeting: "phone", referToManager: false }
            });
          }
          const VALID_ADMIN_CODES = ["AD", "SA", "NH", "R", "FA", "MU"];
          if (!isPRN && code && !VALID_ADMIN_CODES.includes(code)) {
            if (code !== "" && code !== "BLANK" && code !== "EMPTY") {
              discrepancies2.push({
                careWorkerName: careWorker,
                date,
                timeSlot,
                medication,
                code,
                issue: `Invalid code "${code}" used on administered medication - valid codes are: AD, SA, NH, R, FA, MU`,
                severity: "high",
                actions: { performanceNote: true, meeting: "phone", referToManager: true }
              });
            }
          }
        });
        const extractTimeFromEntry = (entry) => {
          let timeStr = (entry.time || "").trim();
          if (timeStr && timeStr.includes(":")) {
            return timeStr;
          }
          const slotStr = (entry.timeSlot || "").trim();
          const timeMatch = slotStr.match(/(\d{1,2}:\d{2})/);
          if (timeMatch) {
            return timeMatch[1];
          }
          const slotLower = slotStr.toLowerCase();
          if (slotLower.includes("morning") || slotLower === "am") return "08:00";
          if (slotLower.includes("lunch") || slotLower.includes("noon")) return "12:00";
          if (slotLower.includes("afternoon")) return "14:00";
          if (slotLower.includes("evening") || slotLower.includes("tea")) return "18:00";
          if (slotLower.includes("night") || slotLower.includes("bed")) return "22:00";
          return null;
        };
        const isAdministeredCode = (code) => {
          const upperCode = code.toUpperCase();
          return ["AD", "PRN-AD", "ADMINISTERED", "GIVEN", "PRN", "G"].includes(upperCode) || upperCode.startsWith("PRN-AD") || // PRN-AD variations only
          upperCode === "A";
        };
        console.log(`DEBUG: Total entries to check for time gaps: ${allEntries.length}`);
        const allUniqueDates = /* @__PURE__ */ new Set();
        allEntries.forEach((entry) => {
          const entryDate = (entry.date || "").trim();
          if (entryDate) allUniqueDates.add(entryDate);
        });
        console.log(`DEBUG: Unique dates found in entries: ${Array.from(allUniqueDates).join(", ")}`);
        const sampleEntries = allEntries.slice(0, 10);
        console.log(`DEBUG: Sample entries for date diagnosis:`);
        sampleEntries.forEach((e, i) => {
          console.log(`  [${i}] ${e.medication} | date="${e.date}" | timeSlot="${e.timeSlot}" | time="${e.time}" | code="${e.code}"`);
        });
        const medDateEntriesForTimeGap = /* @__PURE__ */ new Map();
        let administeredEntriesFound = 0;
        let entriesWithTimes = 0;
        allEntries.forEach((entry) => {
          const code = (entry.code || "").toUpperCase();
          if (["BLANK", "EMPTY", "", "MU", "NH", "R", "FA", "MISSED", "SA"].includes(code)) return;
          if (!isAdministeredCode(code)) return;
          if (entry.isOfficeClosed) {
            console.log(`DEBUG: Skipping office-closed entry from time gap check: ${entry.medication} on ${entry.date}`);
            return;
          }
          const careWorkerInitials = (entry.careWorkerInitials || entry.careWorker || "").trim();
          if (!careWorkerInitials || careWorkerInitials.length < 1) {
            console.log(`DEBUG: Skipping entry without care worker initials: ${entry.medication} on ${entry.date}`);
            return;
          }
          const entryDate = (entry.date || "").trim();
          if (!entryDate || entryDate.length < 3) {
            return;
          }
          const dayNumberMatch = entryDate.match(/\b(\d{1,2})\b/);
          if (!dayNumberMatch) {
            console.log(`DEBUG: Skipping entry with non-specific date: "${entryDate}" for ${entry.medication}`);
            return;
          }
          const timeValue = extractTimeFromEntry(entry);
          if (!timeValue) {
            console.log(`DEBUG: Skipping entry without valid time: ${entry.medication} on ${entryDate}`);
            return;
          }
          administeredEntriesFound++;
          entriesWithTimes++;
          let canonicalDateKey = entryDate.toLowerCase().trim();
          const dayMonthMatch = entryDate.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
          if (dayMonthMatch) {
            const dayNum = dayMonthMatch[1].padStart(2, "0");
            const month = dayMonthMatch[2].toLowerCase();
            canonicalDateKey = `${dayNum}-${month}`;
          }
          const isPRN = prnMeds.has(entry.medication) || code.includes("PRN");
          const key = `${entry.medication}|${canonicalDateKey}`;
          console.log(`DEBUG: Valid administration for gap check: ${entry.medication} on "${entryDate}" (key: ${canonicalDateKey}) at ${timeValue} by ${careWorkerInitials}`);
          if (!medDateEntriesForTimeGap.has(key)) medDateEntriesForTimeGap.set(key, []);
          medDateEntriesForTimeGap.get(key).push({ ...entry, extractedTime: timeValue, isPRN, originalDate: entryDate });
        });
        console.log(`DEBUG: Administered entries found: ${administeredEntriesFound}, with valid times: ${entriesWithTimes}`);
        medDateEntriesForTimeGap.forEach((dayEntries, key) => {
          if (dayEntries.length <= 1) return;
          dayEntries.sort((a, b) => {
            const [aH, aM] = a.extractedTime.split(":").map(Number);
            const [bH, bM] = b.extractedTime.split(":").map(Number);
            return aH * 60 + aM - (bH * 60 + bM);
          });
          const deduped = [];
          for (const entry of dayEntries) {
            const [h, m] = entry.extractedTime.split(":").map(Number);
            const entryMinutes = h * 60 + m;
            const isDuplicate = deduped.some((existing) => {
              const [eH, eM] = existing.extractedTime.split(":").map(Number);
              const existingMinutes = eH * 60 + eM;
              const diff = Math.abs(entryMinutes - existingMinutes);
              return diff < 60;
            });
            if (!isDuplicate) {
              deduped.push(entry);
            } else {
              console.log(`DEBUG: Deduped entry for ${entry.medication} at ${entry.extractedTime} (too close to existing entry)`);
            }
          }
          medDateEntriesForTimeGap.set(key, deduped);
        });
        console.log(`DEBUG: After deduplication, checking gaps for ${medDateEntriesForTimeGap.size} medication-day combinations`);
        medDateEntriesForTimeGap.forEach((dayEntries, key) => {
          if (dayEntries.length < 2) return;
          const [medication, dateKey] = key.split("|");
          const scheduledSlots = medScheduledSlotCount.get(medication) || 1;
          if (scheduledSlots <= 1) {
            console.log(`DEBUG: Skipping time gap check for once-daily medication "${medication}" (${scheduledSlots} scheduled slot)`);
            return;
          }
          const requiredGap = medGapHours.get(medication) || 4;
          const uniqueDates = new Set(dayEntries.map((e) => e.originalDate));
          if (uniqueDates.size > 1) {
            console.log(`DEBUG: WARNING - Multiple dates found in same group for ${medication}: ${Array.from(uniqueDates).join(", ")}`);
            return;
          }
          console.log(`DEBUG: Checking time gaps for ${medication} on "${dateKey}": ${dayEntries.length} entries, required gap: ${requiredGap}h, scheduled slots: ${scheduledSlots}`);
          const sortedEntries = dayEntries.sort((a, b) => {
            const [aH, aM] = a.extractedTime.split(":").map(Number);
            const [bH, bM] = b.extractedTime.split(":").map(Number);
            return aH * 60 + aM - (bH * 60 + bM);
          });
          for (let i = 1; i < sortedEntries.length; i++) {
            const prev = sortedEntries[i - 1];
            const curr = sortedEntries[i];
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
            if (gapHours <= 0.25) {
              console.log(`DEBUG: Skipping near-duplicate entry for ${medication} (${gapHours.toFixed(2)}h gap)`);
              continue;
            }
            if (gapHours < 0) {
              console.log(`DEBUG: Skipping negative gap for ${medication} - possible data issue`);
              continue;
            }
            if (gapHours < requiredGap - 0.17) {
              const gapRatio = gapHours / requiredGap;
              const isLikelyDataError = gapRatio < 0.25 && requiredGap >= 8;
              if (isLikelyDataError) {
                console.log(`DEBUG: Skipping likely false positive - gap ${gapHours.toFixed(1)}h is <25% of required ${requiredGap}h, probably cross-day extraction error`);
                warnings.push({
                  type: "possible_extraction_error",
                  severity: "low",
                  medication,
                  description: `Detected suspiciously short gap (${gapHours.toFixed(1)}h) between ${prev.extractedTime} and ${curr.extractedTime} - likely entries from different days were grouped together due to OCR/extraction issues`,
                  recommendedAction: "Review original EMAR document to verify dates"
                });
                continue;
              }
              const isPRNEntry = prev.isPRN || curr.isPRN;
              const issueType = isPRNEntry ? "PRN medication" : "Medication";
              console.log(`DEBUG: TIME GAP VIOLATION DETECTED: ${medication} on ${curr.originalDate} - ${gapHours.toFixed(1)}h < ${requiredGap}h`);
              discrepancies2.push({
                careWorkerName: curr.careWorker,
                date: curr.date,
                timeSlot: curr.timeSlot,
                medication,
                issue: `${issueType} time gap violation: Only ${gapHours.toFixed(1)} hours between doses (required: ${requiredGap} hours minimum). Previous dose at ${prev.extractedTime}, this dose at ${curr.extractedTime}`,
                severity: "high",
                actions: { performanceNote: true, meeting: "in_person", referToManager: true }
              });
            }
          }
        });
        console.log(`DEBUG: Time gap check completed for ${medDateEntriesForTimeGap.size} medication-day combinations`);
        const muCounts = /* @__PURE__ */ new Map();
        allEntries.forEach((entry) => {
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
        let validatedDiscrepancies = [...discrepancies2];
        const originalCount = discrepancies2.length;
        let validationEvidence = {};
        let validationStatus = "not_run";
        if (discrepancies2.length > 0) {
          console.log(`DEBUG: Starting triple-check validation on ${discrepancies2.length} discrepancies`);
          sendProgress(85, `Validating ${discrepancies2.length} potential issues...`, "validation_running");
          const docContext = analysisText || "";
          const hasTextContext = docContext.length > 100;
          const pass2SystemPrompt = hasTextContext ? `You are a quality assurance reviewer for EMAR (medication) audits. Your job is to review detected discrepancies and filter out ONLY OBVIOUS FALSE POSITIVES.

ORIGINAL DOCUMENT TEXT:
${docContext}

DETECTED DISCREPANCIES TO REVIEW:
${discrepancies2.map((d, i) => `[${i + 1}] ${d.date} - ${d.medication} - ${d.issue} (Care Worker: ${d.careWorkerName})`).join("\n")}

REVIEW CRITERIA - BE CONSERVATIVE:
1. ONLY mark as INVALID if you are 100% certain it's a false positive
2. If in doubt, mark as VALID to preserve the finding
3. Check if the care worker attribution is correct
4. Check if the issue description matches what the document shows

IMPORTANT: It is better to keep a potential false positive than to remove a real discrepancy.

Return JSON with indices that are VALID (keep these). Include ALL indices unless you are CERTAIN one is false:
{"validIndices": [1, 2, 3, 4, 5]}` : `You are a quality assurance reviewer for EMAR (medication) audits. Look at the EMAR chart images and review the detected discrepancies.

DETECTED DISCREPANCIES TO REVIEW:
${discrepancies2.map((d, i) => `[${i + 1}] ${d.date} - ${d.medication} - ${d.issue} (Care Worker: ${d.careWorkerName})`).join("\n")}

REVIEW CRITERIA - BE CONSERVATIVE:
1. ONLY mark as INVALID if you are 100% certain it's a false positive based on what you see in the images
2. If in doubt, mark as VALID to preserve the finding

Return JSON with indices that are VALID (keep these). Include ALL indices unless you are CERTAIN one is false:
{"validIndices": [1, 2, 3, 4, 5]}`;
          let pass2Success = false;
          try {
            const pass2Response = await createChatCompletionWithLogging({
              model: "gpt-4.1-mini",
              messages: [
                { role: "system", content: pass2SystemPrompt },
                {
                  role: "user",
                  content: hasTextContext ? "Review the discrepancies. Be conservative - when in doubt, keep the discrepancy." : [...imageContent, { type: "text", text: "Review the discrepancies based on these EMAR images. Be conservative - when in doubt, keep the discrepancy." }]
                }
              ],
              temperature: 0,
              max_completion_tokens: 2e3,
              response_format: { type: "json_object" }
            }, "emar_validation_pass2", aiUserContext);
            const pass2Content = pass2Response.choices[0]?.message?.content || "{}";
            try {
              const pass2Data = JSON.parse(pass2Content);
              const validIndices = pass2Data.validIndices;
              if (Array.isArray(validIndices) && validIndices.length > 0) {
                const validSet = new Set(validIndices);
                validatedDiscrepancies = discrepancies2.filter((_, i) => validSet.has(i + 1));
                pass2Success = true;
                console.log(`DEBUG: Pass 2 validation - ${discrepancies2.length} -> ${validatedDiscrepancies.length} discrepancies`);
              } else {
                console.log(`DEBUG: Pass 2 returned empty validIndices - keeping all discrepancies`);
              }
            } catch (parseError) {
              console.error("Pass 2 JSON parse error:", parseError);
            }
          } catch (e) {
            console.error("Pass 2 validation error:", e);
          }
          if (validatedDiscrepancies.length > 0) {
            const pass3SystemPrompt = hasTextContext ? `You are the FINAL quality check for EMAR audit discrepancies.

DOCUMENT TEXT:
${docContext}

DISCREPANCIES TO CONFIRM:
${validatedDiscrepancies.map((d, i) => `[${i + 1}] ${d.date} - ${d.medication} - ${d.issue} (Care Worker: ${d.careWorkerName})`).join("\n")}

For EACH discrepancy, provide evidence if you can find it. If you cannot find evidence, the discrepancy may still be valid.

IMPORTANT: Do NOT remove discrepancies just because you cannot find explicit text evidence. The original detection used structured data analysis.

Return JSON - include ALL discrepancy indices by default, and add evidence where you can find it:
{"confirmedIndices": [1, 2, 3], "evidence": {"1": "Code 'R' visible for Paracetamol at 08:00", "2": "Could not locate specific text but detection appears valid"}}` : `You are the FINAL quality check for EMAR audit discrepancies. Look at the EMAR chart images.

DISCREPANCIES TO CONFIRM:
${validatedDiscrepancies.map((d, i) => `[${i + 1}] ${d.date} - ${d.medication} - ${d.issue} (Care Worker: ${d.careWorkerName})`).join("\n")}

Look at the images and provide evidence if visible. Do NOT remove discrepancies just because you cannot see clear evidence.

Return JSON - include ALL discrepancy indices by default, and add evidence where you can find it:
{"confirmedIndices": [1, 2, 3], "evidence": {"1": "Code 'R' visible in image", "2": "Detection appears valid"}}`;
            try {
              const pass3Response = await createChatCompletionWithLogging({
                model: "gpt-4.1-mini",
                messages: [
                  { role: "system", content: pass3SystemPrompt },
                  {
                    role: "user",
                    content: hasTextContext ? "Confirm discrepancies and provide evidence where possible. Keep discrepancies even without explicit text evidence." : [...imageContent, { type: "text", text: "Confirm discrepancies based on these EMAR images. Provide evidence where visible. Keep discrepancies even without clear visual evidence." }]
                  }
                ],
                max_completion_tokens: 2e3,
                temperature: 0,
                response_format: { type: "json_object" }
              }, "emar_validation_pass3", aiUserContext);
              const pass3Content = pass3Response.choices[0]?.message?.content || "{}";
              try {
                const pass3Data = JSON.parse(pass3Content);
                const confirmedIndices = pass3Data.confirmedIndices;
                if (Array.isArray(confirmedIndices) && confirmedIndices.length > 0) {
                  const confirmedSet = new Set(confirmedIndices);
                  const beforeCount = validatedDiscrepancies.length;
                  validatedDiscrepancies = validatedDiscrepancies.filter((_, i) => confirmedSet.has(i + 1));
                  if (pass3Data.evidence) {
                    validationEvidence = pass3Data.evidence;
                  }
                  validationStatus = "completed";
                  console.log(`DEBUG: Pass 3 confirmation - ${beforeCount} -> ${validatedDiscrepancies.length} discrepancies`);
                } else {
                  validationStatus = "partial";
                  console.log(`DEBUG: Pass 3 returned empty confirmedIndices - keeping all discrepancies`);
                }
              } catch (parseError) {
                console.error("Pass 3 JSON parse error:", parseError);
                validationStatus = pass2Success ? "partial" : "failed";
              }
            } catch (e) {
              console.error("Pass 3 validation error:", e);
              validationStatus = pass2Success ? "partial" : "failed";
            }
          } else {
            validationStatus = pass2Success ? "completed" : "failed";
          }
        }
        console.log(`DEBUG: Triple-check complete - ${originalCount} initial -> ${validatedDiscrepancies.length} confirmed (status: ${validationStatus})`);
        sendProgress(95, "Generating report...", "report_generation");
        const mainRefusalDiscrepancies = [];
        const prnRefusalDiscrepancies = [];
        const otherDiscrepancies = [];
        validatedDiscrepancies.forEach((d) => {
          const code = (d.code || "").toUpperCase();
          const isMainRefusalCode = code === "R" || code === "MU" || code === "NH" || code === "FA" || code === "SA";
          const isPrnRefusalCode = code === "PRN-R";
          if (isPrnRefusalCode) {
            prnRefusalDiscrepancies.push(d);
          } else if (isMainRefusalCode) {
            mainRefusalDiscrepancies.push(d);
          } else {
            otherDiscrepancies.push(d);
          }
        });
        const mainRefusalGroups = /* @__PURE__ */ new Map();
        mainRefusalDiscrepancies.forEach((d) => {
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
          const group = mainRefusalGroups.get(key);
          group.dates.push({ date: d.date, timeSlot: d.timeSlot || "", code: d.code || "" });
          group.count++;
        });
        const prnRefusalGroups = /* @__PURE__ */ new Map();
        prnRefusalDiscrepancies.forEach((d) => {
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
          const group = prnRefusalGroups.get(key);
          group.dates.push({ date: d.date, timeSlot: d.timeSlot || "", code: d.code || "" });
          group.count++;
        });
        const groupedMainRefusals = Array.from(mainRefusalGroups.values()).sort((a, b) => b.count - a.count);
        const groupedPrnRefusals = Array.from(prnRefusalGroups.values()).sort((a, b) => b.count - a.count);
        const groupedRefusals = [...groupedMainRefusals, ...groupedPrnRefusals];
        const prioritizedDiscrepancies = otherDiscrepancies.sort((a, b) => {
          const getPriority = (issue) => {
            if (issue.includes("Time gap")) return 1;
            if (issue.includes("Missed")) return 2;
            if (issue.includes("conflict")) return 3;
            return 4;
          };
          return getPriority(a.issue) - getPriority(b.issue);
        });
        const totalMainRefusalCount = mainRefusalDiscrepancies.length;
        const totalPrnRefusalCount = prnRefusalDiscrepancies.length;
        const totalRefusalCount = mainRefusalDiscrepancies.length + prnRefusalDiscrepancies.length;
        const totalOtherDiscrepancyCount = otherDiscrepancies.length;
        const officeClosedEntries = allEntries.filter((e) => e.isOfficeClosed).map((e) => ({
          medication: e.medication,
          date: e.date,
          timeSlot: e.timeSlot,
          code: e.code,
          closedByStaff: e.closedByStaff || "Office Staff",
          closedTime: e.closedTime || ""
        }));
        console.log(`Standard path: Found ${officeClosedEntries.length} office-closed entries`);
        const supportLevelCodes = ["AS", "AD", "P"];
        const supportCodeEntries = allEntries.filter((e) => e.code && supportLevelCodes.includes(e.code.toUpperCase())).map((e) => ({
          careWorkerName: e.careWorker || "Unknown",
          medication: e.medication,
          date: e.date,
          timeSlot: e.timeSlot,
          code: e.code.toUpperCase()
        }));
        console.log(`Standard path: Found ${supportCodeEntries.length} entries with support level codes (AS/AD/P)`);
        const result = {
          serviceUserName: extractedData.serviceUserInitials || "Unknown",
          serviceUserType,
          allergies,
          medicationLevelEvidence: `Code counts (regular meds): AD=${codeCounts.AD}, AS=${codeCounts.AS}, P=${codeCounts.P}. PRN meds: PRN=${prnCodeCounts.PRN}, FA=${prnCodeCounts.FA}, MU=${prnCodeCounts.MU}, NH=${prnCodeCounts.NH}, R=${prnCodeCounts.R}. Service level: ${serviceUserType.toUpperCase()}.`,
          codeConflictDetected,
          codeConflictDetails,
          auditPeriodStart: allDates[0] || "",
          auditPeriodEnd: allDates[allDates.length - 1] || "",
          warnings,
          drugInteractions,
          hasDiscrepancies: validatedDiscrepancies.length > 0,
          discrepancies: prioritizedDiscrepancies,
          groupedRefusals,
          groupedMainRefusals,
          groupedPrnRefusals,
          totalRefusalCount,
          totalMainRefusalCount,
          totalPrnRefusalCount,
          totalOtherDiscrepancyCount,
          userVerificationItems: verificationItems,
          prnMedications: {
            hasPRN: prnMeds.size > 0,
            medications: medications.filter((m) => m.isPRN).map((m) => ({
              name: m.name,
              protocol: "PRN protocol should be in place"
            }))
          },
          officeClosedEntries,
          supportCodeEntries,
          totalEntriesProcessed: allEntries.length,
          totalMedications: medications.length,
          datesAudited: allDates,
          timeSlotsFound: timeSlots,
          extractionMethod: "vision-api",
          validationPasses: 3,
          validationStatus,
          validationEvidence,
          initialDiscrepancyCount: originalCount,
          themesAndTrends: `Processed ${allEntries.length} entries across ${medications.length} medications for ${allDates.length} days. 3-pass Vision consensus validation: ${originalCount} initial findings -> ${validatedDiscrepancies.length} confirmed discrepancies, ${verificationItems.length} items requiring verification, and ${warnings.length} warnings.`,
          gapsInKnowledge: validatedDiscrepancies.length > 0 ? "Training needed on: " + Array.from(new Set(validatedDiscrepancies.map((d) => {
            if (d.issue.includes("refused")) return "documenting refusal reasons";
            if (d.issue.includes("Missing")) return "completing all entries";
            if (d.issue.includes("Time gap")) return "medication timing requirements";
            return "documentation";
          }))).join(", ") : "No significant gaps identified.",
          unknownCareWorkerInitials: Array.from(unknownInitials),
          expectedEntriesCount,
          actualEntriesCount,
          expectedEntryCount: agreedCount,
          countAgreement: countValidationMatch,
          countValidation: {
            medicationCountConsensus,
            agreedMedicationCount,
            extractedMedicationCount,
            agreedCount,
            extractedCount,
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
            description: consensusStatus === "verified" ? `Extraction verified - passes ${consensusDetails.matchingPasses.join(", ")} agreed` : `No consensus - using pass ${consensusDetails.fallbackPassUsed} with highest count for safety`
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
        sendProgress(100, "Analysis complete!", "complete");
        sendEvent("result", result);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error) {
      console.error("EMAR AI Error:", error);
      sendEvent("error", { message: error.message || "AI analysis failed" });
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
    }
  });
  app2.post("/api/ai/analyze-visit", requireAuth, async (req, res) => {
    const { documentContent } = req.body;
    if (!documentContent) {
      return res.status(400).json({ message: "Document content required" });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();
    let heartbeatInterval = null;
    heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat

`);
        if (typeof res.flush === "function") res.flush();
      } catch (e) {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    }, 1e4);
    const sendEvent = (eventType, data) => {
      try {
        const padding = `: ${"x".repeat(4096)}

`;
        const payload = `event: ${eventType}
data: ${JSON.stringify(data)}

`;
        res.write(padding + payload);
        if (typeof res.flush === "function") {
          res.flush();
        }
      } catch (e) {
        console.error("[Visit SSE] Write error:", e);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    };
    const sendProgress = (percent, status, stage) => {
      console.log(`[Visit SSE] Progress: ${percent}% - ${status}`);
      sendEvent("progress", { percent, status, stage });
    };
    try {
      const user = await storage.getUser(req.session.userId);
      const aiUserContext = { userId: user?.id || null, username: user?.username || null };
      sendProgress(5, "Loading policies...", "init");
      const visitPolicies = await storage.getPolicyDocumentsByCategory("visit_audit");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");
      let policyContext = "";
      const allPolicies = [...visitPolicies, ...scopeOfPracticePolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY DOCUMENTS - YOU MUST FOLLOW THESE GUIDELINES ===
${visitPolicies.map((p) => `
--- VISIT AUDIT POLICY: ${p.name} (${p.version || "v1.0"}) ---
${p.content}
`).join("\n")}
${scopeOfPracticePolicies.map((p) => `
--- SCOPE OF PRACTICE: ${p.name} (${p.version || "v1.0"}) ---
${p.content}
`).join("\n")}
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
- Never use m-dashes (\u2014) or en-dashes (\u2013). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

EXTRACT FROM DOCUMENT:
- Service user INITIALS ONLY (e.g., K.S., not full name)
- First and last dates covered in the document

VALIDATION RULES:
1. LOCATION: Carer must log in at location (less than 200m from service user's address) for the call to be compliant.
2. DURATION: Care call is compliant if carer stayed for \u226570% of expected time.
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
      const DETERMINISTIC_SEED = 42;
      sendProgress(30, "Running AI analysis...", "ai_analysis");
      const response = await createChatCompletionWithLogging({
        model: getPreferredModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these visit logs:

${documentContent}` }
        ],
        max_completion_tokens: 4e3,
        temperature: 0,
        seed: DETERMINISTIC_SEED
      }, "visit_audit", aiUserContext);
      sendProgress(50, "Processing initial results...", "parsing_results");
      const content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.discrepancies && Array.isArray(result.discrepancies)) {
          result.discrepancies = result.discrepancies.filter((d) => {
            const name = d.careWorkerName?.toLowerCase?.() || "";
            return name && name !== "n/a" && name !== "unknown" && name !== "not applicable" && name.trim() !== "";
          });
        }
        const originalCount = result.discrepancies?.length || 0;
        let validatedDiscrepancies = [...result.discrepancies || []];
        let validationEvidence = {};
        let validationStatus = "not_run";
        if (validatedDiscrepancies.length > 0) {
          sendProgress(55, `Validating ${validatedDiscrepancies.length} discrepancies...`, "validation_start");
          console.log(`DEBUG Visit Audit: Starting triple-check on ${validatedDiscrepancies.length} discrepancies`);
          const docContext = documentContent.substring(0, 3e4);
          const pass2Prompt = `You are a quality assurance reviewer for care visit audits. Review these detected discrepancies and filter out ONLY OBVIOUS FALSE POSITIVES.

ORIGINAL VISIT LOGS:
${docContext}

DETECTED DISCREPANCIES:
${validatedDiscrepancies.map((d, i) => `[${i + 1}] ${d.date} - ${d.careWorkerName} - ${d.issue}`).join("\n")}

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
            const pass2Response = await createChatCompletionWithLogging({
              model: getPreferredModel(),
              messages: [
                { role: "system", content: pass2Prompt },
                { role: "user", content: "Review discrepancies. Be conservative - when in doubt, keep." }
              ],
              max_completion_tokens: 2e3,
              temperature: 0,
              seed: DETERMINISTIC_SEED
            }, "visit_audit_validation_pass2", aiUserContext);
            const pass2Content = pass2Response.choices[0]?.message?.content || "";
            const pass2Match = pass2Content.match(/\{[\s\S]*\}/);
            if (pass2Match) {
              const pass2Data = JSON.parse(pass2Match[0]);
              const validIndices = pass2Data.validIndices;
              if (Array.isArray(validIndices) && validIndices.length > 0) {
                const validSet = new Set(validIndices);
                validatedDiscrepancies = validatedDiscrepancies.filter((_, i) => validSet.has(i + 1));
                pass2Success = true;
                console.log(`DEBUG Visit Audit: Pass 2 - ${originalCount} -> ${validatedDiscrepancies.length}`);
              } else {
                console.log(`DEBUG Visit Audit: Pass 2 empty validIndices - keeping all`);
              }
            }
          } catch (e) {
            console.error("Visit Pass 2 error:", e);
          }
          if (validatedDiscrepancies.length > 0) {
            const pass3Prompt = `FINAL quality check for visit audit discrepancies.

DOCUMENT:
${docContext}

DISCREPANCIES TO CONFIRM:
${validatedDiscrepancies.map((d, i) => `[${i + 1}] ${d.date} - ${d.careWorkerName} - ${d.issue}`).join("\n")}

For EACH discrepancy, provide evidence if found. Do NOT remove just because text evidence is unclear.

Return JSON - include ALL by default:
{
  "confirmedIndices": [1, 2, 3],
  "evidence": {"1": "15 min visit logged", "2": "Detection appears valid"}
}`;
            try {
              sendProgress(80, "Running validation pass 3...", "validation_pass3");
              const pass3Response = await createChatCompletionWithLogging({
                model: getPreferredModel(),
                messages: [
                  { role: "system", content: pass3Prompt },
                  { role: "user", content: "Confirm and provide evidence. Keep discrepancies even without explicit text." }
                ],
                max_completion_tokens: 2e3,
                temperature: 0,
                seed: DETERMINISTIC_SEED
              }, "visit_audit_validation_pass3", aiUserContext);
              const pass3Content = pass3Response.choices[0]?.message?.content || "";
              const pass3Match = pass3Content.match(/\{[\s\S]*\}/);
              if (pass3Match) {
                const pass3Data = JSON.parse(pass3Match[0]);
                const confirmedIndices = pass3Data.confirmedIndices;
                if (Array.isArray(confirmedIndices) && confirmedIndices.length > 0) {
                  const confirmedSet = new Set(confirmedIndices);
                  validatedDiscrepancies = validatedDiscrepancies.filter((_, i) => confirmedSet.has(i + 1));
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
        sendEvent("result", result);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        sendEvent("error", { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error) {
      console.error("Visit AI Error:", error);
      sendEvent("error", { message: error.message || "AI analysis failed" });
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
    }
  });
  app2.post("/api/ai/analyze-risks", requireAuth, async (req, res) => {
    let heartbeatInterval = null;
    let progressInterval = null;
    const aiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    try {
      const { documentContent } = req.body;
      if (!documentContent) {
        return res.status(400).json({ message: "Document content required" });
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.flushHeaders();
      await new Promise((resolve) => setTimeout(resolve, 100));
      res.write(`: ping

`);
      if (typeof res.flush === "function") res.flush();
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat

`);
          if (typeof res.flush === "function") res.flush();
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 1e4);
      const sendEvent = (eventType, data) => {
        try {
          const padding = `: ${"x".repeat(4096)}

`;
          const payload = `event: ${eventType}
data: ${JSON.stringify(data)}

`;
          res.write(padding + payload);
          if (typeof res.flush === "function") {
            res.flush();
          }
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      const sendProgress = (percent, status, stage) => {
        console.log(`[Risks SSE] Progress: ${percent}% - ${status}`);
        sendEvent("progress", { percent, status, stage });
      };
      sendProgress(5, "Initializing...", "init");
      await new Promise((resolve) => setTimeout(resolve, 50));
      sendProgress(8, "Loading policy documents...", "loading_policies");
      const initialAssessmentPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      const riskAssessmentPolicies = await storage.getPolicyDocumentsByCategory("risk_assessment");
      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");
      let policyContext = "";
      const allPolicies = [...initialAssessmentPolicies, ...riskAssessmentPolicies, ...carePlanPolicies, ...scopeOfPracticePolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY DOCUMENTS - YOU MUST FOLLOW THESE AS REFERENCE ===
${initialAssessmentPolicies.map((p) => `
--- INITIAL ASSESSMENT TEMPLATE: ${p.name} (${p.version || "v1.0"}) ---
${p.content}
`).join("\n")}
${riskAssessmentPolicies.map((p) => `
--- RISK ASSESSMENT TEMPLATE: ${p.name} (${p.version || "v1.0"}) ---
${p.content}
`).join("\n")}
${carePlanPolicies.map((p) => `
--- CARE PLAN TEMPLATE: ${p.name} (${p.version || "v1.0"}) ---
${p.content}
`).join("\n")}
${scopeOfPracticePolicies.map((p) => `
--- SCOPE OF PRACTICE: ${p.name} (${p.version || "v1.0"}) ---
${p.content}
`).join("\n")}
=== END POLICY DOCUMENTS ===

CRITICAL: You MUST structure your response using the templates above as reference. Cover EVERY point from the initial assessment template. Do not skip any sections.

`;
      }
      const systemPrompt = `You are an expert care assessor for a UK care facility. Analyze the uploaded documents to identify service user information and determine which risk assessments are needed.
${policyContext}
FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (\u2014) or en-dashes (\u2013). Use hyphens (-) or commas instead.
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
            "Processing recommendations..."
          ];
          const msgIndex = Math.floor((simulatedProgress - 20) / 10) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "ai_analysis");
        }
      }, 3e3);
      const response = await createChatCompletionWithLogging({
        model: getPreferredModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these documents for risk assessment needs:

${documentContent}` }
        ],
        max_completion_tokens: 4e3
      }, "risk_analysis", aiUserContext);
      clearInterval(progressInterval);
      sendProgress(80, "Processing results...", "processing");
      const content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let result = JSON.parse(jsonMatch[0]);
        if (result.serviceUser) {
          result.serviceUser.initials = normalizeInitials(result.serviceUser.initials);
        }
        result = scrubPII(result);
        sendProgress(100, "Complete!", "complete");
        sendEvent("result", result);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        sendEvent("error", { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error) {
      console.error("Risk Analysis AI Error:", error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (progressInterval) clearInterval(progressInterval);
      if (res.headersSent) {
        res.write(`event: error
data: ${JSON.stringify({ message: error.message || "AI analysis failed" })}

`);
        return res.end();
      }
      return res.status(500).json({ message: error.message || "AI analysis failed" });
    }
  });
  app2.post("/api/ai/generate-risk-assessment", requireAuth, async (req, res) => {
    let heartbeatInterval = null;
    const aiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    try {
      const { documentContent, assessmentCategory, serviceUserInitials, performedBy, performedByJobTitle } = req.body;
      if (!documentContent || !assessmentCategory) {
        return res.status(400).json({ message: "Document content and assessment category required" });
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.flushHeaders();
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat

`);
          if (typeof res.flush === "function") res.flush();
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 1e4);
      const sendEvent = (eventType, data) => {
        try {
          const padding = `: ${"x".repeat(4096)}

`;
          const payload = `event: ${eventType}
data: ${JSON.stringify(data)}

`;
          res.write(padding + payload);
          if (typeof res.flush === "function") {
            res.flush();
          }
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      const sendProgress = (percent, status, stage) => {
        console.log(`[RiskGen SSE] Progress: ${percent}% - ${status}`);
        sendEvent("progress", { percent, status, stage });
      };
      sendProgress(10, "Analyzing documents...", "analyzing");
      const systemPrompt = `You are an expert care risk assessor for a UK care facility. Generate a detailed risk assessment for the specified category.

FORMATTING RULES - MUST FOLLOW:
- Never use m-dashes (\u2014) or en-dashes (\u2013). Use hyphens (-) or commas instead.
- Never use Oxford commas (the comma before "and" or "or" in a list). Write "apples, oranges and bananas" not "apples, oranges, and bananas".

IMPORTANT RULES:
1. ONLY use information explicitly stated in the documents provided
2. If something isn't in the documents, say "I'm not aware of this information based on the documents provided"
3. Use professional but clear language suitable for care documentation
4. Follow CQC (Care Quality Commission) standards

SERVICE USER DETAILS:
- Service User Initials: ${serviceUserInitials || "N.N."}

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
  "serviceUserInitials": "${serviceUserInitials || "N.N."}",
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
  "signedBy": "${performedBy || "Staff member"}",
  "jobTitle": "${performedByJobTitle || "Care Staff"}",
  "additionalNotes": "Any additional notes or observations from the documents, or 'I'm not aware of additional information based on the documents provided'"
}`;
      sendProgress(30, "Generating risk assessment...", "ai_generation");
      const response = await createChatCompletionWithLogging({
        model: getPreferredModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a ${assessmentCategory} risk assessment based on these documents:

${documentContent}` }
        ],
        temperature: 0,
        seed: 42,
        max_completion_tokens: 4e3
      }, "risk_assessment", aiUserContext);
      sendProgress(70, "Processing results...", "processing");
      const content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let result = JSON.parse(jsonMatch[0]);
        const preservedFields = {
          assessmentDate: result.assessmentDate,
          signedBy: result.signedBy || performedBy || "Staff member",
          jobTitle: result.jobTitle || performedByJobTitle || "Care Staff",
          category: result.category
        };
        result.serviceUserInitials = normalizeInitials(result.serviceUserInitials);
        result = scrubPII(result);
        result.assessmentDate = preservedFields.assessmentDate;
        result.signedBy = preservedFields.signedBy;
        result.jobTitle = preservedFields.jobTitle;
        result.category = preservedFields.category;
        sendProgress(100, "Complete!", "complete");
        sendEvent("result", result);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        sendEvent("error", { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error) {
      console.error("Risk Assessment Generation Error:", error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (res.headersSent) {
        res.write(`event: error
data: ${JSON.stringify({ message: error.message || "AI generation failed" })}

`);
        return res.end();
      }
      return res.status(500).json({ message: error.message || "AI generation failed" });
    }
  });
  app2.post("/api/ai/generate-care-plan", requireAuth, async (req, res) => {
    let heartbeatInterval = null;
    const aiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    try {
      const { documentContent, serviceUserInitials } = req.body;
      if (!documentContent) {
        return res.status(400).json({ message: "Document content required" });
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.flushHeaders();
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat

`);
          if (typeof res.flush === "function") res.flush();
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 5e3);
      const sendEvent = (eventType, data) => {
        try {
          const padding = `: ${"x".repeat(4096)}

`;
          const payload = `event: ${eventType}
data: ${JSON.stringify(data)}

`;
          res.write(padding + payload);
          if (typeof res.flush === "function") res.flush();
        } catch (e) {
          console.error("[CarePlan SSE] Write error:", e);
        }
      };
      const sendProgress = (percent, status, stage) => {
        console.log(`[CarePlan SSE] Progress: ${percent}% - ${status}`);
        sendEvent("progress", { percent, status, stage });
      };
      sendProgress(5, "Loading policy documents...", "loading_policies");
      const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB");
      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const taskListPolicies = await storage.getPolicyDocumentsByCategory("care_tasks");
      const socialWorkerPolicies = await storage.getPolicyDocumentsByCategory("social_worker");
      const scopeOfPracticePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");
      const initialAssessmentPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      let policyContext = "";
      const allPolicies = [...carePlanPolicies, ...taskListPolicies, ...socialWorkerPolicies, ...scopeOfPracticePolicies, ...initialAssessmentPolicies];
      if (allPolicies.length > 0) {
        policyContext = `
=== POLICY DOCUMENTS - FOLLOW THESE EXACTLY ===
${initialAssessmentPolicies.map((p) => `--- INITIAL ASSESSMENT: ${p.name} ---
${p.content}`).join("\n")}
${carePlanPolicies.map((p) => `--- CARE PLAN TEMPLATE: ${p.name} ---
${p.content}`).join("\n")}
${taskListPolicies.map((p) => `--- APPROVED TASKS: ${p.name} ---
${p.content}`).join("\n")}
${socialWorkerPolicies.map((p) => `--- SOCIAL WORKER TASKS: ${p.name} ---
${p.content}`).join("\n")}
${scopeOfPracticePolicies.map((p) => `--- SCOPE OF PRACTICE: ${p.name} ---
${p.content}`).join("\n")}
=== END POLICIES ===

REQUIREMENTS:
1. ONLY use tasks from approved lists above - do NOT invent new tasks.
2. Social worker document states EXACT support - include ALL those tasks.
3. Follow CQC (Care Quality Commission) standards.
`;
      }
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
        { title: "Secure Property Before Leaving", priority: "high", focus: "Door locks, windows, appliances off, keys, alarm system - safety checklist before carers leave" }
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
      const completedSections = [];
      let emergencyContacts = "Not found in documents";
      let gpDetails = "Not found in documents";
      let additionalNotes = "No additional notes";
      for (let i = 0; i < mandatorySections.length; i++) {
        const section = mandatorySections[i];
        const progressPercent = 10 + Math.round(i / mandatorySections.length * 80);
        sendProgress(progressPercent, `Generating: ${section.title}...`, "generating");
        console.log(`[CarePlan] Generating section ${i + 1}/${mandatorySections.length}: ${section.title}`);
        try {
          const sectionResponse = await createChatCompletionWithLogging({
            model: "gpt-4.1-mini",
            messages: [
              { role: "system", content: baseSystemPrompt },
              { role: "user", content: `Generate the "${section.title}" section (priority: ${section.priority}).

FOCUS ON: ${section.focus}

Service user documents:
${documentContent}

Remember: Write as if I am the service user speaking about my own needs. Return ONLY valid JSON.` }
            ],
            temperature: 0.3,
            max_completion_tokens: 1500
          }, "care_plan_section", aiUserContext);
          const sectionContent = sectionResponse.choices[0]?.message?.content || "";
          const jsonMatch = sectionContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            let enhancedContent = parsed.content || "";
            if (!enhancedContent.includes("I ") && !enhancedContent.includes("my ")) {
              enhancedContent = enhancedContent.replace(/The (client|service user|patient)/gi, "I");
              enhancedContent = enhancedContent.replace(/Staff should/gi, "I need my carers to");
            }
            const completedSection = {
              title: section.title,
              priority: section.priority,
              content: scrubPII(enhancedContent),
              steps: (Array.isArray(parsed.steps) && parsed.steps.length > 0 ? parsed.steps : ["Please refer to my preferences above", "Check my care notes", "Ask me if unsure"]).map((s) => typeof s === "string" ? scrubPII(s) : String(s)),
              risks: (Array.isArray(parsed.risks) ? parsed.risks : []).map((r) => typeof r === "string" ? scrubPII(r) : String(r)),
              equipment: (Array.isArray(parsed.equipment) ? parsed.equipment : []).map((e) => typeof e === "string" ? scrubPII(e) : String(e))
            };
            completedSections.push(completedSection);
            sendEvent("section", { index: i, section: completedSection });
          } else {
            const fallbackSection = {
              title: section.title,
              priority: section.priority,
              content: "Based on my documents, I do not have specific requirements in this area. Please ask me about my preferences.",
              steps: ["Ask me about my preferences for this area"],
              risks: [],
              equipment: []
            };
            completedSections.push(fallbackSection);
            sendEvent("section", { index: i, section: fallbackSection });
          }
        } catch (sectionError) {
          console.error(`[CarePlan] Error generating section "${section.title}":`, sectionError.message);
          const fallbackSection = {
            title: section.title,
            priority: section.priority,
            content: "Unable to generate this section. Please add information manually.",
            steps: ["Add information for this section manually"],
            risks: [],
            equipment: []
          };
          completedSections.push(fallbackSection);
          sendEvent("section", { index: i, section: fallbackSection });
        }
      }
      try {
        const metaResponse = await createChatCompletionWithLogging({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: "Extract contact information from the documents. Return JSON only." },
            { role: "user", content: `From these documents, extract:
1. Emergency contacts (names, relationships, phone numbers)
2. GP details (name, surgery, phone)
3. Any additional important notes

Documents:
${documentContent.substring(0, 3e3)}

Return JSON: {"emergencyContacts": "...", "gpDetails": "...", "additionalNotes": "..."}` }
          ],
          temperature: 0,
          max_completion_tokens: 500
        }, "care_plan_meta", aiUserContext);
        const metaContent = metaResponse.choices[0]?.message?.content || "";
        const metaMatch = metaContent.match(/\{[\s\S]*\}/);
        if (metaMatch) {
          const meta = JSON.parse(metaMatch[0]);
          const extractedEmergency = meta.emergencyContacts || emergencyContacts;
          const extractedGp = meta.gpDetails || gpDetails;
          const extractedNotes = meta.additionalNotes || additionalNotes;
          const emergencyStr = typeof extractedEmergency === "string" ? extractedEmergency : extractedEmergency ? JSON.stringify(extractedEmergency) : emergencyContacts;
          const gpStr = typeof extractedGp === "string" ? extractedGp : extractedGp ? JSON.stringify(extractedGp) : gpDetails;
          const notesStr = typeof extractedNotes === "string" ? extractedNotes : extractedNotes ? JSON.stringify(extractedNotes) : additionalNotes;
          emergencyContacts = scrubPII(emergencyStr);
          gpDetails = scrubPII(gpStr);
          additionalNotes = scrubPII(notesStr);
        }
      } catch (e) {
        console.log("[CarePlan] Could not extract meta info, using defaults");
      }
      const result = {
        serviceUserInitials: normalizeInitials(serviceUserInitials || "N.N."),
        generatedDate: today,
        sections: Array.isArray(completedSections) ? completedSections.filter((s) => s != null && typeof s === "object") : [],
        emergencyContacts: String(emergencyContacts || ""),
        gpDetails: String(gpDetails || ""),
        additionalNotes: String(additionalNotes || "")
      };
      sendProgress(100, "Complete!", "complete");
      sendEvent("result", result);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      return res.end();
    } catch (error) {
      console.error("Care Plan Generation Error:", error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (res.headersSent) {
        res.write(`event: error
data: ${JSON.stringify({ message: error.message || "AI generation failed" })}

`);
        return res.end();
      }
      return res.status(500).json({ message: error.message || "AI generation failed" });
    }
  });
  app2.post("/api/ai/enhance-plan", requireAuth, async (req, res) => {
    let heartbeatInterval = null;
    let progressInterval = null;
    const aiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    try {
      const { documentContent, existingPlanContent } = req.body;
      if (!documentContent && !existingPlanContent) {
        return res.status(400).json({ message: "Document content or existing plan required" });
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.flushHeaders();
      await new Promise((resolve) => setTimeout(resolve, 100));
      res.write(`: ping

`);
      if (typeof res.flush === "function") res.flush();
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat

`);
          if (typeof res.flush === "function") res.flush();
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 1e4);
      const sendEvent = (eventType, data) => {
        try {
          const padding = `: ${"x".repeat(4096)}

`;
          const payload = `event: ${eventType}
data: ${JSON.stringify(data)}

`;
          res.write(padding + payload);
          if (typeof res.flush === "function") {
            res.flush();
          }
        } catch (e) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      };
      const sendProgress = (percent, status, stage) => {
        console.log(`[Enhance SSE] Progress: ${percent}% - ${status}`);
        sendEvent("progress", { percent, status, stage });
      };
      sendProgress(5, "Initializing...", "init");
      await new Promise((resolve) => setTimeout(resolve, 50));
      sendProgress(10, "Preparing documents...", "preparing");
      const rawContent = existingPlanContent || documentContent;
      const contentToEnhance = typeof rawContent === "string" ? scrubPII(rawContent) : rawContent;
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
            "Finalizing plan content..."
          ];
          const msgIndex = Math.floor((simulatedProgress - 25) / 7) % messages.length;
          sendProgress(simulatedProgress, messages[msgIndex], "ai_generation");
        }
      }, 3e3);
      const response = await createChatCompletionWithLogging({
        model: getPreferredModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this document and generate a complete care plan template. Extract all relevant information and write detailed first-person content for each section:

${contentToEnhance}` }
        ],
        temperature: 0,
        seed: 42,
        max_completion_tokens: 12e3
      }, "plan_enhancer", aiUserContext);
      clearInterval(progressInterval);
      sendProgress(75, "Processing results...", "processing");
      const content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        const scrubbedResult = scrubPII(result);
        sendProgress(100, "Complete!", "complete");
        sendEvent("result", scrubbedResult);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      } else {
        sendEvent("error", { message: "Failed to parse AI response" });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        return res.end();
      }
    } catch (error) {
      console.error("Plan Enhancement Error:", error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (progressInterval) clearInterval(progressInterval);
      if (res.headersSent) {
        res.write(`event: error
data: ${JSON.stringify({ message: error.message || "AI enhancement failed" })}

`);
        return res.end();
      }
      return res.status(500).json({ message: error.message || "AI enhancement failed" });
    }
  });
  app2.post("/api/risk-assessment-logs", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const log2 = await storage.createRiskAssessmentLog(req.body);
      return res.status(201).json(log2);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/risk-assessment-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAllRiskAssessmentLogs();
      return res.json(logs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/admin/session-history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const history = await storage.getAllSessionHistory();
      return res.json(history);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/admin/suspension-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getSuspensionLogs();
      return res.json(logs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/admin/users/:id/suspend", requireAuth, requireAdmin, async (req, res) => {
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
      const now = /* @__PURE__ */ new Date();
      const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1e3);
      await storage.suspendUser(req.params.id, endsAt);
      await storage.createSuspensionLog({
        userId: targetUser.id,
        username: targetUser.username,
        adminId: req.user.id,
        adminUsername: req.user.username,
        durationMinutes,
        reason: reason || null,
        startsAt: now,
        endsAt
      });
      await storage.deleteActiveSessionByUserId(req.params.id);
      sendToUser(req.params.id, {
        type: "FORCE_LOGOUT",
        message: `You have been suspended for ${durationMinutes} minutes.${reason ? ` Reason: ${reason}` : ""}`
      });
      return res.json({ message: "User suspended", suspendedUntil: endsAt });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/admin/users/:id/reinstate", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.suspendUser(req.params.id, null);
      const logs = await storage.getSuspensionLogsByUser(req.params.id);
      if (logs.length > 0 && logs[0].endsAt > /* @__PURE__ */ new Date()) {
        await storage.reinstateSuspension(logs[0].id);
      }
      return res.json({ message: "User reinstated" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/admin/users/:id/kick", requireAuth, requireAdmin, async (req, res) => {
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
          sessionStore.destroy(activeSession.sessionId, (err) => {
            if (err) console.error("Failed to destroy session:", err);
          });
        }
        sendToUser(req.params.id, {
          type: "FORCE_LOGOUT",
          message: "You have been logged out by an administrator."
        });
      }
      return res.json({ message: "User kicked" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/admin/users/:id/name", requireAuth, requireAdmin, async (req, res) => {
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
        jobTitle: user.jobTitle
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/admin/audit-trail", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [riskLogs, discrepancies2, suspensionLogs2, sessionHistoryData] = await Promise.all([
        storage.getAllRiskAssessmentLogs(),
        storage.getAllDiscrepancies(),
        storage.getSuspensionLogs(),
        storage.getAllSessionHistory()
      ]);
      return res.json({
        riskAssessments: riskLogs,
        discrepancies: discrepancies2,
        suspensions: suspensionLogs2,
        sessionHistory: sessionHistoryData
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/admin/users-presence", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [allUsers, activeSess] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllActiveSessions()
      ]);
      const activeUserIds = new Set(activeSess.map((s) => s.userId));
      const usersWithPresence = allUsers.map((u) => ({
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
        currentSession: activeSess.find((s) => s.userId === u.id) || null
      }));
      return res.json(usersWithPresence);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/admin/blocked-ips", requireAuth, requireAdmin, async (req, res) => {
    try {
      const blockedIps2 = await storage.getAllBlockedIps();
      return res.json(blockedIps2);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/admin/block-ip", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { ipAddress, reason, username } = req.body;
      if (!ipAddress) {
        return res.status(400).json({ message: "IP address is required" });
      }
      const existing = await storage.getBlockedIpByAddress(ipAddress);
      if (existing) {
        return res.status(400).json({ message: "IP address is already blocked" });
      }
      const blocked = await storage.blockIp({
        ipAddress,
        blockedBy: req.user.username,
        reason: reason || null,
        username: username || null
      });
      return res.json(blocked);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/admin/blocked-ips/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.unblockIp(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/ai/rewrite-email", requireAuth, async (req, res) => {
    const aiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
    try {
      const { inputText, tone } = req.body;
      if (!inputText || !tone) {
        return res.status(400).json({ message: "Input text and tone are required" });
      }
      const toneInstructions = {
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
        model: getPreferredModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: inputText }
        ],
        max_completion_tokens: 1e3
      }, "email_assistant", aiUserContext);
      const rewrittenEmail = response.choices[0]?.message?.content;
      if (!rewrittenEmail) {
        return res.status(500).json({ message: "Failed to generate email" });
      }
      return res.json({ rewrittenEmail });
    } catch (error) {
      console.error("Email rewrite error:", error);
      return res.status(500).json({ message: error.message || "Failed to rewrite email" });
    }
  });
  app2.post("/api/ai/generate-prn-protocol", requireAuth, async (req, res) => {
    const aiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };
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
      const userPrompt = existingData ? `Generate a complete PRN protocol for: ${medicationName}

Existing information available:
${JSON.stringify(existingData, null, 2)}

Please enhance and complete this protocol with all required fields.` : `Generate a complete PRN protocol for: ${medicationName}`;
      const response = await createChatCompletionWithLogging({
        model: getPreferredModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" }
      }, "prn_protocol", aiUserContext);
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
    } catch (error) {
      console.error("PRN protocol generation error:", error);
      return res.status(500).json({ message: error.message || "Failed to generate PRN protocol" });
    }
  });
  app2.post("/api/refusal-reviews", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const { auditId, careWorkerName, medication, refusalDate, timeSlot, reasonAcceptable, reviewerNotes } = req.body;
      if (!careWorkerName || !medication || !refusalDate) {
        return res.status(400).json({ message: "Care worker name, medication, and refusal date are required" });
      }
      const user = await storage.getUser(req.session.userId);
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
        reviewedBy: user.username
      });
      return res.status(201).json(review);
    } catch (error) {
      console.error("Refusal review creation error:", error);
      return res.status(500).json({ message: error.message || "Failed to create refusal review" });
    }
  });
  app2.get("/api/refusal-reviews", requireAuth, async (req, res) => {
    try {
      const reviews = await storage.getAllRefusalReviews();
      return res.json(reviews);
    } catch (error) {
      console.error("Get refusal reviews error:", error);
      return res.status(500).json({ message: error.message || "Failed to get refusal reviews" });
    }
  });
  app2.patch("/api/refusal-reviews/:id", requireAuth, async (req, res) => {
    try {
      const { reasonAcceptable, reviewerNotes } = req.body;
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const review = await storage.updateRefusalReview(
        req.params.id,
        reasonAcceptable,
        user.username,
        // Always use session user, never client-supplied
        reviewerNotes
      );
      if (!review) {
        return res.status(404).json({ message: "Refusal review not found" });
      }
      return res.json(review);
    } catch (error) {
      console.error("Refusal review update error:", error);
      return res.status(500).json({ message: error.message || "Failed to update refusal review" });
    }
  });
  app2.post("/api/refusal-reviews/bulk", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const { reviews } = req.body;
      if (!Array.isArray(reviews) || reviews.length === 0) {
        return res.status(400).json({ message: "Reviews array is required" });
      }
      const user = await storage.getUser(req.session.userId);
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
          reviewedBy: user.username
        });
        createdReviews.push(review);
      }
      return res.status(201).json(createdReviews);
    } catch (error) {
      console.error("Bulk refusal review creation error:", error);
      return res.status(500).json({ message: error.message || "Failed to create refusal reviews" });
    }
  });
  app2.post("/api/emar-corrections", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const { corrections, serviceUserInitials, auditId } = req.body;
      if (!Array.isArray(corrections) || corrections.length === 0) {
        return res.status(400).json({ message: "Corrections array is required" });
      }
      const user = await storage.getUser(req.session.userId);
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
          correctionNote: c.correctionNote || null
        });
        count++;
      }
      return res.status(201).json({ success: true, count });
    } catch (error) {
      console.error("EMAR corrections save error:", error);
      return res.status(500).json({ message: error.message || "Failed to save EMAR corrections" });
    }
  });
  app2.get("/api/admin/ai-provider", requireAuth, requireAdmin, async (req, res) => {
    try {
      const provider = getPreferredProvider();
      const hasOpenAIKey = !!process.env.OPENAI_FALLBACK_API_KEY;
      return res.json({ provider, hasOpenAIKey });
    } catch (error) {
      console.error("AI provider fetch error:", error);
      return res.status(500).json({ message: error.message || "Failed to fetch AI provider" });
    }
  });
  app2.post("/api/admin/ai-provider", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { provider } = req.body;
      if (provider !== "replit" && provider !== "openai") {
        return res.status(400).json({ message: "Invalid provider. Must be 'replit' or 'openai'" });
      }
      if (provider === "openai" && !process.env.OPENAI_FALLBACK_API_KEY) {
        return res.status(400).json({ message: "OpenAI API key not configured. Set OPENAI_FALLBACK_API_KEY secret." });
      }
      setPreferredProvider(provider);
      console.log(`[Admin] AI provider changed to ${provider} by ${req.user?.username || "unknown"}`);
      return res.json({ success: true, provider });
    } catch (error) {
      console.error("AI provider update error:", error);
      return res.status(500).json({ message: error.message || "Failed to update AI provider" });
    }
  });
  app2.get("/api/ai-usage", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAiUsageLogs({ limit: 100 });
      const stats = await storage.getAiUsageStats();
      return res.json({ logs, stats });
    } catch (error) {
      console.error("AI usage fetch error:", error);
      return res.status(500).json({ message: error.message || "Failed to fetch AI usage" });
    }
  });
  function colLetterToIndex(letter) {
    let result = 0;
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 64);
    }
    return result - 1;
  }
  function indexToColLetter(index) {
    let result = "";
    while (index >= 0) {
      result = String.fromCharCode(index % 26 + 65) + result;
      index = Math.floor(index / 26) - 1;
    }
    return result;
  }
  function mapCancellationToCode(reason) {
    if (!reason || typeof reason !== "string") return "";
    const lowerReason = reason.toLowerCase().trim();
    if (lowerReason.includes("hospital")) return "L1";
    if (lowerReason.includes("capacity")) return "L5";
    if (lowerReason.includes("less than 24") || lowerReason.includes("<24") || lowerReason.includes("under 24")) return "L5";
    if (lowerReason.includes("more than 24") || lowerReason.includes(">24") || lowerReason.includes("over 24")) return "L4";
    if (lowerReason.includes("24 hour") && lowerReason.includes("less")) return "L5";
    if (lowerReason.includes("24 hour") && lowerReason.includes("more")) return "L4";
    return "";
  }
  app2.post("/api/reconciliation/analyze", requireAuth, requireAdmin, uploadExcel.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      console.log(`[Reconciliation] Processing file: ${req.file.originalname}`);
      const fileName = req.file.originalname.toLowerCase();
      const isCSV = fileName.endsWith(".csv");
      let workbook;
      if (isCSV) {
        const csvString = req.file.buffer.toString("utf-8");
        workbook = XLSX.read(csvString, { type: "string", cellDates: true });
        console.log(`[Reconciliation] Parsed CSV file, converting to Excel format`);
      } else {
        workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
      }
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (data.length === 0) {
        return res.status(400).json({ message: "Excel file is empty" });
      }
      const columnsToDelete = /* @__PURE__ */ new Set();
      for (let i = 0; i <= 4; i++) columnsToDelete.add(i);
      for (let i = 6; i <= 8; i++) columnsToDelete.add(i);
      for (let i = 10; i <= 19; i++) columnsToDelete.add(i);
      columnsToDelete.add(20);
      for (let i = 21; i <= 22; i++) columnsToDelete.add(i);
      for (let i = 25; i <= 29; i++) columnsToDelete.add(i);
      columnsToDelete.add(30);
      for (let i = 33; i <= 38; i++) columnsToDelete.add(i);
      for (let i = 41; i <= 66; i++) columnsToDelete.add(i);
      for (let i = 69; i <= 128; i++) columnsToDelete.add(i);
      columnsToDelete.add(129);
      for (let i = 130; i <= 178; i++) columnsToDelete.add(i);
      const SERVICE_REQ_COL = 20;
      const CANCELLATION_COL = 129;
      const processedData = [];
      for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
        const row = data[rowIdx];
        const newRow = [];
        const serviceReqValue = row[SERVICE_REQ_COL];
        const cancellationValue = row[CANCELLATION_COL];
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          if (!columnsToDelete.has(colIdx)) {
            newRow.push(row[colIdx]);
          }
        }
        if (rowIdx === 0) {
          newRow.push("Variation Reason");
        } else {
          let variationReason = "";
          if (cancellationValue && String(cancellationValue).trim()) {
            variationReason = mapCancellationToCode(String(cancellationValue));
          }
          if (!serviceReqValue || !String(serviceReqValue).trim()) {
            variationReason = "A1";
          }
          newRow.push(variationReason);
        }
        processedData.push(newRow);
      }
      const newWorkbook = XLSX.utils.book_new();
      const newWorksheet = XLSX.utils.aoa_to_sheet(processedData, { cellDates: true });
      const range = XLSX.utils.decode_range(newWorksheet["!ref"] || "A1");
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = newWorksheet[cellAddress];
          if (cell && cell.t === "d") {
            cell.z = "DD/MM/YYYY HH:MM:SS";
          }
        }
      }
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Reconciled");
      const excelBuffer = XLSX.write(newWorkbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="reconciled_${Date.now()}.xlsx"`);
      console.log(`[Reconciliation] Processed ${processedData.length} rows, sending Excel file`);
      return res.send(excelBuffer);
    } catch (error) {
      console.error("Reconciliation error:", error);
      return res.status(500).json({ message: error.message || "Failed to process Excel file" });
    }
  });
  return httpServer2;
}

// server/static.ts
var import_express = __toESM(require("express"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
function serveStatic(app2) {
  const distPath = import_path.default.resolve(__dirname, "public");
  if (!import_fs.default.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(import_express.default.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(import_path.default.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var import_http = require("http");
var app = (0, import_express2.default)();
var httpServer = (0, import_http.createServer)(app);
var CUSTOM_DOMAIN = "careassurance.uk";
app.use((req, res, next) => {
  const host = req.get("host") || "";
  if (process.env.NODE_ENV === "production" && (host.includes(".replit.app") || host.includes(".replit.dev"))) {
    const redirectUrl = `https://${CUSTOM_DOMAIN}${req.originalUrl}`;
    return res.redirect(301, redirectUrl);
  }
  next();
});
app.use((0, import_compression.default)({
  filter: (req, res) => {
    return import_compression.default.filter(req, res);
  }
}));
app.use(
  import_express2.default.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(import_express2.default.urlencoded({ extended: false, limit: "50mb" }));
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
app.use((req, res, next) => {
  const start = Date.now();
  const path2 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path2.startsWith("/api")) {
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  try {
    const existingAdmin = await storage.getUserByUsername("Lewis.barron");
    if (!existingAdmin) {
      await storage.createUser({
        username: "Lewis.barron",
        password: "testtest",
        role: "admin",
        status: "active"
      });
      log("Created admin user (username: Lewis.barron)");
    }
  } catch (error) {
    log("Note: Could not check/create admin user - database may not be ready yet");
  }
  await registerRoutes(httpServer, app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`serving on port ${port}`);
    }
  );
})();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  log
});
