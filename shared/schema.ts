import { sql } from "drizzle-orm";
import { pgTable, pgView, text, varchar, timestamp, integer, jsonb, json, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
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

// Care Worker Rotas - stores saved optimized runs from Testing Features
export const careWorkerRotas = pgTable("care_worker_rotas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerName: text("worker_name").notNull(),
  workerKey: text("worker_key").notNull(),
  templateWeek: text("template_week").notNull(), // week1 / week2
  templateDay: text("template_day").notNull(), // Monday..Sunday
  payload: jsonb("payload").notNull(),
  sourceHash: text("source_hash").notNull().unique(),
  createdBy: varchar("created_by").references(() => users.id),
  createdByUsername: text("created_by_username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCareWorkerRotaSchema = createInsertSchema(careWorkerRotas).omit({
  id: true,
  createdAt: true,
});

export type InsertCareWorkerRota = z.infer<typeof insertCareWorkerRotaSchema>;
export type CareWorkerRota = typeof careWorkerRotas.$inferSelect;

// Session store table used by connect-pg-simple
export const sessions = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  })
);

// Keep extension-managed view in schema so drizzle-kit doesn't try to drop it.
export const pgStatStatementsInfo = pgView("pg_stat_statements_info", {}).existing();
export const pgStatStatements = pgView("pg_stat_statements", {}).existing();

// Rostering template recommendations - stores suggested template call groups per worker/week/day
export const rosteringTemplateRecommendations = pgTable(
  "rostering_template_recommendations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workerKey: text("worker_key").notNull(),
    templateWeek: text("template_week").notNull(), // week1 / week2
    templateDay: text("template_day").notNull(), // Monday..Sunday
    groupKey: text("group_key").notNull(),
    createdBy: varchar("created_by").references(() => users.id),
    createdByUsername: text("created_by_username"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueRecommendation: uniqueIndex("rostering_template_recommendations_unique").on(
      table.workerKey,
      table.templateWeek,
      table.templateDay,
      table.groupKey
    ),
  })
);

export const insertRosteringTemplateRecommendationSchema = createInsertSchema(
  rosteringTemplateRecommendations
).omit({
  id: true,
  createdAt: true,
});

export type InsertRosteringTemplateRecommendation = z.infer<
  typeof insertRosteringTemplateRecommendationSchema
>;
export type RosteringTemplateRecommendation = typeof rosteringTemplateRecommendations.$inferSelect;

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
  featureName: text("feature").notNull(),
  model: text("model").notNull(),
  billingSource: text("billing_source").notNull().default("openai"), // 'openai' - which API was billed
  provider: text("provider").notNull().default("openai"), // 'openai' - which API was billed
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costMicroDollars: integer("cost_micros").notNull().default(0),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

// Contact Messages table - stores contact form submissions for admin review
export const contactMessages = pgTable("contact_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  organisation: text("organisation"),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  readBy: text("read_by"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({
  id: true,
  isRead: true,
  isArchived: true,
  readBy: true,
  readAt: true,
  createdAt: true,
});

export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;
export type ContactMessage = typeof contactMessages.$inferSelect;

// Testing Feature Workbooks - stores uploaded workbook analysis data
export const testingFeatureWorkbooks = pgTable("testing_feature_workbooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // User-defined name for the workbook
  fileName: text("file_name").notNull(), // Original uploaded file name
  sourceHash: text("source_hash").notNull().unique(), // SHA256 hash for deduplication
  
  // Parsed data counts for quick display
  totalRows: integer("total_rows").notNull().default(0),
  careWorkerCount: integer("care_worker_count").notNull().default(0),
  serviceUserCount: integer("service_user_count").notNull().default(0),
  callGroupCount: integer("call_group_count").notNull().default(0),
  
  // Full analysis data stored as JSONB
  rowAnalysis: jsonb("row_analysis").notNull(), // Array of RowAnalysis objects
  callGroups: jsonb("call_groups").notNull(), // Array of CallGroup objects
  careWorkerRosters: jsonb("care_worker_rosters").notNull(), // Array of CareWorkerRoster objects
  doubleUpSlots: jsonb("double_up_slots").notNull(), // Map of slot keys to worker arrays
  
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdByUsername: text("created_by_username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTestingFeatureWorkbookSchema = createInsertSchema(testingFeatureWorkbooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTestingFeatureWorkbook = z.infer<typeof insertTestingFeatureWorkbookSchema>;
export type TestingFeatureWorkbook = typeof testingFeatureWorkbooks.$inferSelect;

// Testing Feature Double-Up Links - tracks linked double-up calls that must move together
export const testingFeatureDoubleUpLinks = pgTable(
  "testing_feature_double_up_links",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id").notNull().references(() => testingFeatureWorkbooks.id, { onDelete: "cascade" }),
    slotKey: text("slot_key").notNull(), // Unique identifier for the call slot (date+time+serviceUser)
    linkedSlotKey: text("linked_slot_key").notNull(), // The partner slot key for double-up
    primaryWorkerKey: text("primary_worker_key").notNull(),
    secondaryWorkerKey: text("secondary_worker_key").notNull(),
    scheduledStartMinutes: integer("scheduled_start_minutes").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    serviceUserName: text("service_user_name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueDoubleUpLink: uniqueIndex("testing_feature_double_up_links_unique").on(
      table.workbookId,
      table.slotKey,
      table.primaryWorkerKey
    ),
  })
);

export const insertTestingFeatureDoubleUpLinkSchema = createInsertSchema(testingFeatureDoubleUpLinks).omit({
  id: true,
  createdAt: true,
});

export type InsertTestingFeatureDoubleUpLink = z.infer<typeof insertTestingFeatureDoubleUpLinkSchema>;
export type TestingFeatureDoubleUpLink = typeof testingFeatureDoubleUpLinks.$inferSelect;

// ============================================================================
// ROSTERING STUDIO - Recommended Times & Worker Templates
// ============================================================================

// Recommended Call Times - stores preferred times for service user calls
// Used by optimizer to schedule calls at appropriate times
export const rosteringRecommendedCallTimes = pgTable(
  "rostering_recommended_call_times",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id").notNull().references(() => testingFeatureWorkbooks.id, { onDelete: "cascade" }),
    serviceUserKey: text("service_user_key").notNull(), // Normalized service user identifier
    serviceUserName: text("service_user_name").notNull(), // Display name
    callTypeLabel: text("call_type_label").notNull(), // e.g., "Morning", "Lunch", "Tea", "Bed"
    recommendedStartMinutes: integer("recommended_start_minutes").notNull(), // Minutes from midnight
    toleranceMinutes: integer("tolerance_minutes").notNull().default(30), // Acceptable variation
    priority: integer("priority").notNull().default(1), // Higher = more important to respect
    notes: text("notes"),
    createdBy: varchar("created_by").references(() => users.id),
    createdByUsername: text("created_by_username"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueCallTime: uniqueIndex("rostering_recommended_call_times_unique").on(
      table.workbookId,
      table.serviceUserKey,
      table.callTypeLabel
    ),
    workbookIdx: index("rostering_recommended_call_times_workbook_idx").on(table.workbookId),
  })
);

export const insertRosteringRecommendedCallTimeSchema = createInsertSchema(rosteringRecommendedCallTimes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRosteringRecommendedCallTime = z.infer<typeof insertRosteringRecommendedCallTimeSchema>;
export type RosteringRecommendedCallTime = typeof rosteringRecommendedCallTimes.$inferSelect;

// Recommended Worker Start Times - when each care worker should begin their shift
export const rosteringWorkerStartTimes = pgTable(
  "rostering_worker_start_times",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id").notNull().references(() => testingFeatureWorkbooks.id, { onDelete: "cascade" }),
    workerKey: text("worker_key").notNull(),
    workerName: text("worker_name").notNull(),
    templateWeek: text("template_week").notNull(), // week1 / week2
    templateDay: text("template_day").notNull(), // Monday..Sunday
    recommendedStartMinutes: integer("recommended_start_minutes").notNull(), // Minutes from midnight
    recommendedEndMinutes: integer("recommended_end_minutes"), // Optional shift end time
    maxCallsPerDay: integer("max_calls_per_day"), // Workload limit
    maxMinutesPerDay: integer("max_minutes_per_day"), // Time limit
    notes: text("notes"),
    createdBy: varchar("created_by").references(() => users.id),
    createdByUsername: text("created_by_username"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueWorkerStart: uniqueIndex("rostering_worker_start_times_unique").on(
      table.workbookId,
      table.workerKey,
      table.templateWeek,
      table.templateDay
    ),
    workbookIdx: index("rostering_worker_start_times_workbook_idx").on(table.workbookId),
  })
);

export const insertRosteringWorkerStartTimeSchema = createInsertSchema(rosteringWorkerStartTimes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRosteringWorkerStartTime = z.infer<typeof insertRosteringWorkerStartTimeSchema>;
export type RosteringWorkerStartTime = typeof rosteringWorkerStartTimes.$inferSelect;

// Worker-Service User Templates - remembers who is assigned to visit whom regularly
export const rosteringWorkerTemplates = pgTable(
  "rostering_worker_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id").notNull().references(() => testingFeatureWorkbooks.id, { onDelete: "cascade" }),
    workerKey: text("worker_key").notNull(),
    workerName: text("worker_name").notNull(),
    serviceUserKey: text("service_user_key").notNull(),
    serviceUserName: text("service_user_name").notNull(),
    callTypeLabels: text("call_type_labels").array(), // Which call types this worker handles for this SU
    isPrimary: boolean("is_primary").notNull().default(true), // Primary vs backup worker
    priority: integer("priority").notNull().default(1), // Assignment priority (1 = first choice)
    templateWeek: text("template_week"), // Optional: week1/week2 specific
    templateDay: text("template_day"), // Optional: day-specific assignment
    notes: text("notes"),
    createdBy: varchar("created_by").references(() => users.id),
    createdByUsername: text("created_by_username"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueTemplate: uniqueIndex("rostering_worker_templates_unique").on(
      table.workbookId,
      table.workerKey,
      table.serviceUserKey,
      table.templateWeek,
      table.templateDay
    ),
    workbookIdx: index("rostering_worker_templates_workbook_idx").on(table.workbookId),
    workerIdx: index("rostering_worker_templates_worker_idx").on(table.workbookId, table.workerKey),
    serviceUserIdx: index("rostering_worker_templates_service_user_idx").on(table.workbookId, table.serviceUserKey),
  })
);

export const insertRosteringWorkerTemplateSchema = createInsertSchema(rosteringWorkerTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRosteringWorkerTemplate = z.infer<typeof insertRosteringWorkerTemplateSchema>;
export type RosteringWorkerTemplate = typeof rosteringWorkerTemplates.$inferSelect;

// Worker Workload Constraints - max calls/hours per worker
export const rosteringWorkerConstraints = pgTable(
  "rostering_worker_constraints",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id").notNull().references(() => testingFeatureWorkbooks.id, { onDelete: "cascade" }),
    workerKey: text("worker_key").notNull(),
    workerName: text("worker_name").notNull(),
    maxCallsPerDay: integer("max_calls_per_day"), // Daily call limit
    maxMinutesPerDay: integer("max_minutes_per_day"), // Daily time limit
    maxCallsPerWeek: integer("max_calls_per_week"), // Weekly call limit
    maxMinutesPerWeek: integer("max_minutes_per_week"), // Weekly time limit
    preferredMaxDistance: integer("preferred_max_distance"), // Max travel distance (km)
    availableDays: text("available_days").array(), // Days available to work
    unavailableDates: text("unavailable_dates").array(), // Specific dates unavailable
    notes: text("notes"),
    createdBy: varchar("created_by").references(() => users.id),
    createdByUsername: text("created_by_username"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueConstraint: uniqueIndex("rostering_worker_constraints_unique").on(
      table.workbookId,
      table.workerKey
    ),
    workbookIdx: index("rostering_worker_constraints_workbook_idx").on(table.workbookId),
  })
);

export const insertRosteringWorkerConstraintSchema = createInsertSchema(rosteringWorkerConstraints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRosteringWorkerConstraint = z.infer<typeof insertRosteringWorkerConstraintSchema>;
export type RosteringWorkerConstraint = typeof rosteringWorkerConstraints.$inferSelect;

// Saved Roster States - persist optimized schedules
export const rosteringSavedStates = pgTable(
  "rostering_saved_states",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id").notNull().references(() => testingFeatureWorkbooks.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // User-given name for this state
    description: text("description"), // Optional description
    templateWeek: text("template_week").notNull(), // Week template (week_a, week_b, etc.)
    templateDay: text("template_day").notNull(), // Day template (monday, tuesday, etc.)
    timeOverrides: jsonb("time_overrides").notNull().default({}), // { entryId: startMinutes }
    laneOverrides: jsonb("lane_overrides").notNull().default({}), // { entryId: laneId }
    metrics: jsonb("metrics"), // Optimization metrics snapshot
    isActive: boolean("is_active").notNull().default(false), // Currently active schedule
    createdBy: varchar("created_by").references(() => users.id),
    createdByUsername: text("created_by_username"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    workbookIdx: index("rostering_saved_states_workbook_idx").on(table.workbookId),
    activeIdx: index("rostering_saved_states_active_idx").on(table.workbookId, table.isActive),
  })
);

export const insertRosteringSavedStateSchema = createInsertSchema(rosteringSavedStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRosteringSavedState = z.infer<typeof insertRosteringSavedStateSchema>;
export type RosteringSavedState = typeof rosteringSavedStates.$inferSelect;
