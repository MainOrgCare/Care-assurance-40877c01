import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Current terms version - increment when terms are updated
export const CURRENT_TERMS_VERSION = "1.0";

// Users table with role and status
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  password: text("password").notNull(),
  role: text("role").notNull().default("staff"), // 'admin' or 'staff'
  status: text("status").notNull().default("pending"), // 'pending' or 'active'
  jobTitle: text("job_title"),
  suspendedUntil: timestamp("suspended_until"),
  lastOnlineAt: timestamp("last_online_at"),
  dashboardWidgets: jsonb("dashboard_widgets"), // Array of widget IDs in display order
  termsAcceptedAt: timestamp("terms_accepted_at"), // When user accepted terms
  termsVersion: text("terms_version"), // Which version of terms they accepted
  termsSignatureName: text("terms_signature_name"), // Full name typed by user when accepting
  termsSignatureDate: text("terms_signature_date"), // Date typed by user when accepting (DD/MM/YYYY)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Care Workers table
export const careWorkers = pgTable("care_workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Anonymized format: L.Barron
  role: text("role").notNull(), // 'Care Coordinator', 'Carer', etc.
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCareWorkerSchema = createInsertSchema(careWorkers).omit({
  id: true,
  createdAt: true,
});

export type InsertCareWorker = z.infer<typeof insertCareWorkerSchema>;
export type CareWorker = typeof careWorkers.$inferSelect;

// Discrepancies table
export const discrepancies = pgTable("discrepancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  careWorkerId: varchar("care_worker_id").notNull().references(() => careWorkers.id),
  type: text("type").notNull(), // 'EMAR' or 'Visit Audit'
  date: text("date").notNull(), // Format: DD/MMM/YYYY
  description: text("description").notNull(),
  action: text("action").notNull(), // 'Office Discussion', 'Performance Note', etc.
  severity: text("severity"), // 'low', 'medium', 'high'
  actionMedium: text("action_medium"), // 'meeting', 'phone', 'video', 'manager'
  manager: text("manager"), // Manager name if referred
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDiscrepancySchema = createInsertSchema(discrepancies).omit({
  id: true,
  createdAt: true,
});

export type InsertDiscrepancy = z.infer<typeof insertDiscrepancySchema>;
export type Discrepancy = typeof discrepancies.$inferSelect;

// Audits table - stores EMAR and Visit audit results
export const audits = pgTable("audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceUserName: text("service_user_name").notNull(), // Anonymized: K.Spencer
  auditor: text("auditor").notNull(),
  auditType: text("audit_type").notNull(), // 'EMAR' or 'Visit'
  periodStart: text("period_start").notNull(), // DD/MMM/YYYY
  periodEnd: text("period_end").notNull(), // DD/MMM/YYYY
  results: jsonb("results").notNull(), // Stores full audit data
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditSchema = createInsertSchema(audits).omit({
  id: true,
  createdAt: true,
});

export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type Audit = typeof audits.$inferSelect;

// Admin Alerts table
export const adminAlerts = pgTable("admin_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  careWorkerId: varchar("care_worker_id").notNull().references(() => careWorkers.id),
  careWorkerName: text("care_worker_name").notNull(),
  message: text("message").notNull(),
  discrepancyType: text("discrepancy_type").notNull(), // 'EMAR' or 'Visit Audit'
  discrepancyCount: integer("discrepancy_count").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminAlertSchema = createInsertSchema(adminAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminAlert = z.infer<typeof insertAdminAlertSchema>;
export type AdminAlert = typeof adminAlerts.$inferSelect;

// Active Sessions table - tracks who is logged in
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

export const insertActiveSessionSchema = createInsertSchema(activeSessions).omit({
  id: true,
  lastActivity: true,
  createdAt: true,
});

export type InsertActiveSession = z.infer<typeof insertActiveSessionSchema>;
export type ActiveSession = typeof activeSessions.$inferSelect;

// Risk Assessment Logs - tracks offered vs selected risk assessments
// PRIVACY: Only stores service user initials, NO date of birth, NO full names
export const riskAssessmentLogs = pgTable("risk_assessment_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceUserInitials: text("service_user_initials").notNull(), // Only initials like "K.S." - NO full names
  performedBy: text("performed_by").notNull(),
  performedByJobTitle: text("performed_by_job_title"),
  offeredAssessments: jsonb("offered_assessments").notNull(), // Array of assessment names
  selectedAssessments: jsonb("selected_assessments").notNull(), // Array of selected assessment names
  skippedMandatory: jsonb("skipped_mandatory").notNull(), // Array of mandatory assessments that were skipped
  documentSummary: text("document_summary"), // Summary of what was analyzed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Policy Documents - stores Dale Care policy content for AI reference
export const policyDocuments = pgTable("policy_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Medication Policy", "EMAR Audit SOP"
  category: text("category").notNull(), // "medication", "emar_audit", "prn_protocol", "care_plan"
  content: text("content").notNull(), // Full text content of the policy section
  keywords: text("keywords").array(), // Keywords for matching relevant sections
  version: text("version"), // Document version
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPolicyDocumentSchema = createInsertSchema(policyDocuments).omit({
  id: true,
  createdAt: true,
});

export type InsertPolicyDocument = z.infer<typeof insertPolicyDocumentSchema>;
export type PolicyDocument = typeof policyDocuments.$inferSelect;

// System Logs - tracks audit completion and system events
export const systemLogs = pgTable("system_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(), // "audit_completed", "user_login", "session_disconnect"
  userId: varchar("user_id"),
  username: text("username"),
  details: jsonb("details"), // Additional event details
  serviceUserInitials: text("service_user_initials"), // Only initials for privacy
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
export type SystemLog = typeof systemLogs.$inferSelect;

export const insertRiskAssessmentLogSchema = createInsertSchema(riskAssessmentLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertRiskAssessmentLog = z.infer<typeof insertRiskAssessmentLogSchema>;
export type RiskAssessmentLog = typeof riskAssessmentLogs.$inferSelect;

// Session History - tracks login/logout for presence
export const sessionHistory = pgTable("session_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  username: text("username").notNull(),
  sessionId: text("session_id").notNull(),
  ipAddress: text("ip_address"),
  city: text("city"),
  country: text("country"),
  loggedInAt: timestamp("logged_in_at").notNull().defaultNow(),
  loggedOutAt: timestamp("logged_out_at"),
  durationSeconds: integer("duration_seconds"),
  terminatedByAdmin: boolean("terminated_by_admin").default(false),
});

export const insertSessionHistorySchema = createInsertSchema(sessionHistory).omit({
  id: true,
});

export type InsertSessionHistory = z.infer<typeof insertSessionHistorySchema>;
export type SessionHistory = typeof sessionHistory.$inferSelect;

// Suspension Logs - tracks temporary access revocations
export const suspensionLogs = pgTable("suspension_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  username: text("username").notNull(),
  adminId: varchar("admin_id").notNull(),
  adminUsername: text("admin_username").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  reason: text("reason"),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  reinstatedEarly: boolean("reinstated_early").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSuspensionLogSchema = createInsertSchema(suspensionLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertSuspensionLog = z.infer<typeof insertSuspensionLogSchema>;
export type SuspensionLog = typeof suspensionLogs.$inferSelect;

// EMAR Refusal Reviews - tracks admin reviews of refused medications
export const emarRefusalReviews = pgTable("emar_refusal_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: varchar("audit_id"), // Reference to the audit if saved
  careWorkerName: text("care_worker_name").notNull(),
  medication: text("medication").notNull(),
  refusalDate: text("refusal_date").notNull(), // DD/MMM/YYYY format
  timeSlot: text("time_slot"),
  reasonAcceptable: boolean("reason_acceptable").notNull().default(false),
  reviewerNotes: text("reviewer_notes"),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmarRefusalReviewSchema = createInsertSchema(emarRefusalReviews).omit({
  id: true,
  reviewedAt: true,
  createdAt: true,
});

export type InsertEmarRefusalReview = z.infer<typeof insertEmarRefusalReviewSchema>;
export type EmarRefusalReview = typeof emarRefusalReviews.$inferSelect;

// Blocked IPs table - tracks IP addresses that are blocked from logging in
export const blockedIps = pgTable("blocked_ips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: text("ip_address").notNull().unique(),
  blockedBy: text("blocked_by").notNull(),
  reason: text("reason"),
  username: text("username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBlockedIpSchema = createInsertSchema(blockedIps).omit({
  id: true,
  createdAt: true,
});

export type InsertBlockedIp = z.infer<typeof insertBlockedIpSchema>;
export type BlockedIp = typeof blockedIps.$inferSelect;

// File Scan Logs - tracks virus scanning for uploaded files
export const fileScanLogs = pgTable("file_scan_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  fileSize: integer("file_size").notNull(),
  scanResult: text("scan_result").notNull(), // 'clean' or 'threat'
  threatsFound: text("threats_found"), // JSON if threats
  scannedBy: text("scanned_by"),
  uploadType: text("upload_type"), // 'policy-document', 'parse-pdf', 'emar-analysis'
  cachedResult: boolean("cached_result").default(false), // True if result came from cache
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
});

export const insertFileScanLogSchema = createInsertSchema(fileScanLogs).omit({
  id: true,
  scannedAt: true,
});

export type InsertFileScanLog = z.infer<typeof insertFileScanLogSchema>;
export type FileScanLog = typeof fileScanLogs.$inferSelect;

// EMAR Corrections table - stores admin corrections for AI training
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

export const insertEmarCorrectionSchema = createInsertSchema(emarCorrections).omit({
  id: true,
  createdAt: true,
});

export type InsertEmarCorrection = z.infer<typeof insertEmarCorrectionSchema>;
export type EmarCorrection = typeof emarCorrections.$inferSelect;

// AI Usage Logs table - tracks AI API calls for cost monitoring
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  username: text("username"),
  featureName: text("feature_name").notNull(),
  model: text("model").notNull(),
  provider: text("provider").notNull().default("replit"), // 'replit' or 'openai' - which API was billed
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costMicroDollars: integer("cost_micro_dollars").notNull().default(0),
  durationMs: integer("duration_ms"),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;
