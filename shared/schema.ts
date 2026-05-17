import { sql } from "drizzle-orm";
import { pgTable, pgView, text, varchar, timestamp, integer, jsonb, json, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { DEFAULT_USER_ROLE } from "./roles";

// Current terms version - increment when terms are updated
export const CURRENT_TERMS_VERSION = "1.0";

// Users table with role and status
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  password: text("password").notNull(),
  role: text("role").notNull().default(DEFAULT_USER_ROLE), // 'admin', 'staff', or 'pilot'
  status: text("status").notNull().default("pending"), // 'pending' or 'active'
  jobTitle: text("job_title"),
  suspendedUntil: timestamp("suspended_until"),
  lastOnlineAt: timestamp("last_online_at"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: text("two_factor_secret"),
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
  twoFactorEnabled: true,
  twoFactorSecret: true,
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
}, (table) => ({
  careWorkerIdx: index("discrepancies_care_worker_idx").on(table.careWorkerId),
  typeIdx: index("discrepancies_type_idx").on(table.type),
}));

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
}, (table) => ({
  auditTypeIdx: index("audits_audit_type_idx").on(table.auditType),
  createdAtIdx: index("audits_created_at_idx").on(table.createdAt),
}));

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
}, (table) => ({
  careWorkerIdx: index("admin_alerts_care_worker_idx").on(table.careWorkerId),
  unreadIdx: index("admin_alerts_unread_idx").on(table.isRead, table.createdAt),
}));

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
}, (table) => ({
  userIdIdx: index("active_sessions_user_id_idx").on(table.userId),
  sessionIdIdx: index("active_sessions_session_id_idx").on(table.sessionId),
}));

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
}, (table) => ({
  eventTypeIdx: index("system_logs_event_type_idx").on(table.eventType),
  createdAtIdx: index("system_logs_created_at_idx").on(table.createdAt),
  userIdIdx: index("system_logs_user_id_idx").on(table.userId),
}));

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
}, (table) => ({
  userIdIdx: index("session_history_user_id_idx").on(table.userId),
  loggedInAtIdx: index("session_history_logged_in_at_idx").on(table.loggedInAt),
}));

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
}, (table) => ({
  fileHashIdx: index("file_scan_logs_file_hash_idx").on(table.fileHash),
}));

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
}, (table) => ({
  adminIdx: index("emar_corrections_admin_idx").on(table.adminId),
  auditIdx: index("emar_corrections_audit_idx").on(table.auditId),
}));

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
  requestPayload: jsonb("request_payload"), // Full AI request data (messages, params, etc.)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("ai_usage_logs_user_id_idx").on(table.userId),
  featureIdx: index("ai_usage_logs_feature_idx").on(table.featureName),
  createdAtIdx: index("ai_usage_logs_created_at_idx").on(table.createdAt),
}));

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

// User Messages table - internal messaging system for Compli-ee and admin communications
export const userMessages = pgTable("user_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientId: varchar("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").references(() => users.id, { onDelete: "set null" }), // null = system/Compli-ee
  senderName: text("sender_name").notNull().default("Compli-ee"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  priority: text("priority").notNull().default("normal"), // normal, high, urgent
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  recipientIdx: index("user_messages_recipient_idx").on(table.recipientId),
  unreadIdx: index("user_messages_unread_idx").on(table.isRead, table.recipientId),
}));

export const insertUserMessageSchema = createInsertSchema(userMessages).omit({
  id: true,
  isRead: true,
  isArchived: true,
  readAt: true,
  createdAt: true,
});

export type InsertUserMessage = z.infer<typeof insertUserMessageSchema>;
export type UserMessage = typeof userMessages.$inferSelect;

// ============================================================================
// ROSTERING DATA EXTRACTION - Analyzed Data from Workbooks
// Data retained for 3 months, deduplicated across uploads
// ============================================================================

// Analyzed Service Users - service user profiles extracted from workbooks
export const analyzedServiceUsers = pgTable(
  "analyzed_service_users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    serviceUserKey: text("service_user_key").notNull().unique(), // Normalized identifier
    serviceUserName: text("service_user_name").notNull(),
    serviceUserArea: text("service_user_area"), // Geographic area
    serviceUserAddress: text("service_user_address"),
    serviceLocationBranch: text("service_location_branch"),
    serviceLocationType: text("service_location_type"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    totalCallsAnalyzed: integer("total_calls_analyzed").notNull().default(0),
    earliestDataDate: text("earliest_data_date"), // Earliest call date in data
    latestDataDate: text("latest_data_date"), // Most recent call date
    metadata: jsonb("metadata"), // Additional extracted info
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(), // 3 months from last update
  },
  (table) => ({
    keyIdx: index("analyzed_service_users_key_idx").on(table.serviceUserKey),
    expiresIdx: index("analyzed_service_users_expires_idx").on(table.expiresAt),
  })
);

export const insertAnalyzedServiceUserSchema = createInsertSchema(analyzedServiceUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnalyzedServiceUser = z.infer<typeof insertAnalyzedServiceUserSchema>;
export type AnalyzedServiceUser = typeof analyzedServiceUsers.$inferSelect;

// Access Care Planning Service Users - stable mapping of display names to ACP record IDs
export const accessCarePlanningServiceUsers = pgTable(
  "access_care_planning_service_users",
  {
    accessCarePlanningId: text("access_care_planning_id").primaryKey(),
    serviceUserName: text("service_user_name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("access_care_planning_service_users_name_idx").on(table.serviceUserName),
  })
);

export const insertAccessCarePlanningServiceUserSchema = createInsertSchema(accessCarePlanningServiceUsers).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertAccessCarePlanningServiceUser = z.infer<typeof insertAccessCarePlanningServiceUserSchema>;
export type AccessCarePlanningServiceUser = typeof accessCarePlanningServiceUsers.$inferSelect;

// Analyzed Care Workers - care worker profiles extracted from workbooks  
export const analyzedCareWorkers = pgTable(
  "analyzed_care_workers",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workerKey: text("worker_key").notNull().unique(), // Normalized identifier
    workerName: text("worker_name").notNull(),
    workerNameNormalized: text("worker_name_normalized").notNull(),
    isAdminStaff: boolean("is_admin_staff").notNull().default(false),
    totalCallsAnalyzed: integer("total_calls_analyzed").notNull().default(0),
    uniqueServiceUsers: integer("unique_service_users").notNull().default(0),
    avgCallsPerDay: integer("avg_calls_per_day"),
    avgMinutesPerDay: integer("avg_minutes_per_day"),
    earliestDataDate: text("earliest_data_date"),
    latestDataDate: text("latest_data_date"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    keyIdx: index("analyzed_care_workers_key_idx").on(table.workerKey),
    expiresIdx: index("analyzed_care_workers_expires_idx").on(table.expiresAt),
  })
);

export const insertAnalyzedCareWorkerSchema = createInsertSchema(analyzedCareWorkers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnalyzedCareWorker = z.infer<typeof insertAnalyzedCareWorkerSchema>;
export type AnalyzedCareWorker = typeof analyzedCareWorkers.$inferSelect;

// Service Orders - recurring call patterns for service users
// Format: "AM x7 days x2 carers, 30 mins"
export const serviceOrders = pgTable(
  "service_orders",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    serviceUserKey: text("service_user_key").notNull(),
    serviceUserName: text("service_user_name").notNull(),
    callTypeLabel: text("call_type_label").notNull(), // Morning, Lunch, Tea, Bed, Domestic, etc.
    callTypeKey: text("call_type_key").notNull(),
    timeBand: text("time_band").notNull(), // AM, PM, EVE, etc.
    serviceRequirementMinutes: integer("service_requirement_minutes").notNull(), // Duration
    serviceRequirementStartTime: integer("service_requirement_start_time"), // Minutes from midnight
    serviceRequirementEndTime: integer("service_requirement_end_time"),
    daysPerWeek: integer("days_per_week").notNull(), // How many days (0-7)
    week1Days: text("week1_days").array(), // Which days in week 1
    week2Days: text("week2_days").array(), // Which days in week 2
    carersRequired: integer("carers_required").notNull().default(1), // 1 for single, 2 for double-up
    isTimeCritical: boolean("is_time_critical").notNull().default(false),
    orderSummary: text("order_summary").notNull(), // "AM x7 days x2 carers, 30 mins"
    actualAvgStartTime: integer("actual_avg_start_time"), // Average actual start time
    actualAvgDuration: integer("actual_avg_duration"), // Average actual duration
    durationVariance: integer("duration_variance"), // How much actual varies from requirement
    startTimeVariance: integer("start_time_variance"), // How much times vary
    recommendedAdjustment: text("recommended_adjustment"), // "increase_duration", "decrease_duration", null
    recommendedDurationMinutes: integer("recommended_duration_minutes"), // Suggested duration
    recommendedStartMinutes: integer("recommended_start_minutes"), // Suggested start time
    sourceDataCount: integer("source_data_count").notNull().default(0), // How many calls analyzed
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    uniqueServiceOrder: uniqueIndex("service_orders_unique").on(
      table.serviceUserKey,
      table.callTypeKey,
      table.timeBand
    ),
    serviceUserIdx: index("service_orders_service_user_idx").on(table.serviceUserKey),
    expiresIdx: index("service_orders_expires_idx").on(table.expiresAt),
  })
);

export const insertServiceOrderSchema = createInsertSchema(serviceOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertServiceOrder = z.infer<typeof insertServiceOrderSchema>;
export type ServiceOrder = typeof serviceOrders.$inferSelect;

// Template Assignments - which care worker is templated to which call
// Uses most recent data - if templated in week 1 but not 2 weeks later, NOT templated
export const templateAssignments = pgTable(
  "template_assignments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workerKey: text("worker_key").notNull(),
    workerName: text("worker_name").notNull(),
    serviceUserKey: text("service_user_key").notNull(),
    serviceUserName: text("service_user_name").notNull(),
    callTypeLabel: text("call_type_label").notNull(),
    timeBand: text("time_band").notNull(),
    templateWeek: text("template_week").notNull(), // week1 / week2
    templateDay: text("template_day").notNull(), // Monday..Sunday
    isTemplated: boolean("is_templated").notNull().default(true),
    isPrimary: boolean("is_primary").notNull().default(true), // Primary worker for this slot
    serviceRequirementStartMinutes: integer("service_requirement_start_minutes"),
    sourceDateKey: text("source_date_key").notNull(), // Date this was observed (YYYY-MM-DD)
    sourceRowHash: text("source_row_hash"), // For deduplication
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    uniqueTemplate: uniqueIndex("template_assignments_unique").on(
      table.workerKey,
      table.serviceUserKey,
      table.callTypeLabel,
      table.templateWeek,
      table.templateDay
    ),
    workerIdx: index("template_assignments_worker_idx").on(table.workerKey),
    serviceUserIdx: index("template_assignments_service_user_idx").on(table.serviceUserKey),
    weekDayIdx: index("template_assignments_week_day_idx").on(table.templateWeek, table.templateDay),
    expiresIdx: index("template_assignments_expires_idx").on(table.expiresAt),
  })
);

export const insertTemplateAssignmentSchema = createInsertSchema(templateAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTemplateAssignment = z.infer<typeof insertTemplateAssignmentSchema>;
export type TemplateAssignment = typeof templateAssignments.$inferSelect;

// Analyzed Call History - individual calls extracted (deduplicated)
// Historic data is immutable - only insert, never update
export const analyzedCalls = pgTable(
  "analyzed_calls",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    callHash: text("call_hash").notNull().unique(), // SHA256 for deduplication
    serviceUserKey: text("service_user_key").notNull(),
    serviceUserName: text("service_user_name").notNull(),
    workerKey: text("worker_key").notNull(),
    workerName: text("worker_name").notNull(),
    callTypeLabel: text("call_type_label").notNull(),
    callTypeKey: text("call_type_key").notNull(),
    timeBand: text("time_band").notNull(),
    callDate: text("call_date").notNull(), // YYYY-MM-DD
    templateWeek: text("template_week").notNull(), // week1 / week2
    templateDay: text("template_day").notNull(), // Monday..Sunday
    isTemplated: boolean("is_templated").notNull().default(false),
    isDoubleUp: boolean("is_double_up").notNull().default(false),
    isTimeCritical: boolean("is_time_critical").notNull().default(false),
    serviceRequirementStartMinutes: integer("service_requirement_start_minutes"),
    serviceRequirementEndMinutes: integer("service_requirement_end_minutes"),
    plannedStartMinutes: integer("planned_start_minutes"),
    actualStartMinutes: integer("actual_start_minutes"),
    actualEndMinutes: integer("actual_end_minutes"),
    plannedDurationMinutes: integer("planned_duration_minutes"),
    actualDurationMinutes: integer("actual_duration_minutes"),
    durationVarianceMinutes: integer("duration_variance_minutes"), // actual - planned
    startVarianceMinutes: integer("start_variance_minutes"), // actual - requirement
    serviceLocationBranch: text("service_location_branch"),
    serviceLocationType: text("service_location_type"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    hashIdx: index("analyzed_calls_hash_idx").on(table.callHash),
    serviceUserIdx: index("analyzed_calls_service_user_idx").on(table.serviceUserKey),
    workerIdx: index("analyzed_calls_worker_idx").on(table.workerKey),
    dateIdx: index("analyzed_calls_date_idx").on(table.callDate),
    expiresIdx: index("analyzed_calls_expires_idx").on(table.expiresAt),
  })
);

export const insertAnalyzedCallSchema = createInsertSchema(analyzedCalls).omit({
  id: true,
  createdAt: true,
});

export type InsertAnalyzedCall = z.infer<typeof insertAnalyzedCallSchema>;
export type AnalyzedCall = typeof analyzedCalls.$inferSelect;

// Call Recommendations - AI/algorithm-generated suggestions
export const callRecommendations = pgTable(
  "call_recommendations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    serviceUserKey: text("service_user_key").notNull(),
    serviceUserName: text("service_user_name").notNull(),
    callTypeLabel: text("call_type_label").notNull(),
    recommendationType: text("recommendation_type").notNull(), // "time_change", "duration_change", "worker_change"
    currentValue: text("current_value"), // Current setting
    recommendedValue: text("recommended_value"), // Suggested change
    reason: text("reason").notNull(), // Why this recommendation
    confidence: integer("confidence").notNull().default(50), // 0-100 confidence score
    priority: integer("priority").notNull().default(1), // 1-5, higher = more important
    dataPoints: integer("data_points").notNull().default(0), // How many calls support this
    isApplied: boolean("is_applied").notNull().default(false), // Has user applied this
    appliedBy: varchar("applied_by").references(() => users.id),
    appliedAt: timestamp("applied_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    serviceUserIdx: index("call_recommendations_service_user_idx").on(table.serviceUserKey),
    typeIdx: index("call_recommendations_type_idx").on(table.recommendationType),
    appliedByIdx: index("call_recommendations_applied_by_idx").on(table.appliedBy),
    expiresIdx: index("call_recommendations_expires_idx").on(table.expiresAt),
  })
);

export const insertCallRecommendationSchema = createInsertSchema(callRecommendations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCallRecommendation = z.infer<typeof insertCallRecommendationSchema>;
export type CallRecommendation = typeof callRecommendations.$inferSelect;

// Workbook Upload Metadata - just tracks uploads, not raw data
export const workbookUploads = pgTable(
  "workbook_uploads",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(), // For tracking duplicates
    company: text("company"),
    branch: text("branch"),
    totalRows: integer("total_rows").notNull().default(0),
    dateRangeStart: text("date_range_start"), // First date in workbook
    dateRangeEnd: text("date_range_end"), // Last date in workbook
    careWorkersExtracted: integer("care_workers_extracted").notNull().default(0),
    serviceUsersExtracted: integer("service_users_extracted").notNull().default(0),
    callsExtracted: integer("calls_extracted").notNull().default(0),
    serviceOrdersGenerated: integer("service_orders_generated").notNull().default(0),
    templatesDetected: integer("templates_detected").notNull().default(0),
    recommendationsCreated: integer("recommendations_created").notNull().default(0),
    uploadedBy: varchar("uploaded_by").references(() => users.id),
    uploadedByUsername: text("uploaded_by_username"),
    processingStatus: text("processing_status").notNull().default("pending"), // pending, processing, complete, error
    processingError: text("processing_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    hashIdx: index("workbook_uploads_hash_idx").on(table.fileHash),
    statusIdx: index("workbook_uploads_status_idx").on(table.processingStatus),
  })
);

export const insertWorkbookUploadSchema = createInsertSchema(workbookUploads).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkbookUpload = z.infer<typeof insertWorkbookUploadSchema>;
export type WorkbookUpload = typeof workbookUploads.$inferSelect;

// ============================================================================
// ROSTERING STUDIO - Scheduling & Optimization
// ============================================================================

// Recommended Call Times - stores preferred times for service user calls
// Used by optimizer to schedule calls at appropriate times
export const rosteringRecommendedCallTimes = pgTable(
  "rostering_recommended_call_times",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id").notNull().references(() => workbookUploads.id, { onDelete: "cascade" }),
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
    workbookId: varchar("workbook_id").notNull().references(() => workbookUploads.id, { onDelete: "cascade" }),
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
    workbookId: varchar("workbook_id").notNull().references(() => workbookUploads.id, { onDelete: "cascade" }),
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
    workbookId: varchar("workbook_id").notNull().references(() => workbookUploads.id, { onDelete: "cascade" }),
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
    workbookId: varchar("workbook_id").notNull().references(() => workbookUploads.id, { onDelete: "cascade" }),
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

// Schedule Template Library (reusable schedule templates per workbook)
export const rosteringScheduleTemplates = pgTable(
  "rostering_schedule_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workbookId: varchar("workbook_id").notNull().references(() => workbookUploads.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("custom"), // optimized | baseline | seasonal | custom
    weekDay: text("week_day").notNull(), // monday, tuesday, etc.
    weekNumber: text("week_number").notNull(), // week_a, week_b, etc.
    scheduleState: jsonb("schedule_state").notNull().default({}), // The roster state snapshot
    rating: integer("rating"), // 1-5 stars
    usageCount: integer("usage_count").notNull().default(0),
    metadata: jsonb("metadata").default({}), // totalWorkers, totalCalls, etc.
    createdBy: varchar("created_by").references(() => users.id),
    createdByUsername: text("created_by_username"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    workbookIdx: index("rostering_schedule_templates_workbook_idx").on(table.workbookId),
  })
);

export const insertRosteringScheduleTemplateSchema = createInsertSchema(rosteringScheduleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRosteringScheduleTemplate = z.infer<typeof insertRosteringScheduleTemplateSchema>;
export type RosteringScheduleTemplate = typeof rosteringScheduleTemplates.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// UK GDPR COMPLIANCE TABLES
// ═══════════════════════════════════════════════════════════════════════════

// GDPR Consent Records - tracks user consent for AI processing
export const gdprConsentRecords = pgTable("gdpr_consent_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  username: text("username").notNull(),
  consentType: text("consent_type").notNull(), // 'ai_processing', 'data_analytics', 'third_party_sharing'
  granted: boolean("granted").notNull(),
  version: text("version").notNull(), // Consent policy version
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  withdrawnAt: timestamp("withdrawn_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userConsentIdx: index("gdpr_consent_user_type_idx").on(table.userId, table.consentType),
}));

export const insertGdprConsentRecordSchema = createInsertSchema(gdprConsentRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertGdprConsentRecord = z.infer<typeof insertGdprConsentRecordSchema>;
export type GdprConsentRecord = typeof gdprConsentRecords.$inferSelect;

// GDPR Audit Log - persistent security audit trail for compliance
export const gdprAuditLogs = pgTable("gdpr_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(), // 'PII_SCRUB', 'PII_RESTORE', 'AI_REQUEST', 'DATA_EXPORT', 'DATA_DELETE', 'CONSENT_CHANGE'
  endpoint: text("endpoint").notNull(),
  userId: varchar("user_id"),
  username: text("username"),
  ipAddress: text("ip_address"),
  piiCategories: jsonb("pii_categories"), // { NHS_NUM: 2, NAME: 5, etc. }
  piiItemCount: integer("pii_item_count"),
  details: jsonb("details"), // Additional event-specific details
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  eventTypeIdx: index("gdpr_audit_event_type_idx").on(table.eventType),
  userIdx: index("gdpr_audit_user_idx").on(table.userId),
  createdAtIdx: index("gdpr_audit_created_at_idx").on(table.createdAt),
}));

export const insertGdprAuditLogSchema = createInsertSchema(gdprAuditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertGdprAuditLog = z.infer<typeof insertGdprAuditLogSchema>;
export type GdprAuditLog = typeof gdprAuditLogs.$inferSelect;

// GDPR Data Subject Requests - tracks SAR, deletion, portability requests
export const gdprDataRequests = pgTable("gdpr_data_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestType: text("request_type").notNull(), // 'access', 'erasure', 'portability', 'rectification', 'restriction'
  requesterId: varchar("requester_id").references(() => users.id), // User making request (if logged in)
  requesterEmail: text("requester_email"), // For external requests
  requesterName: text("requester_name"),
  subjectId: varchar("subject_id").references(() => users.id), // User whose data is requested
  subjectIdentifier: text("subject_identifier"), // Email/username if user not in system
  status: text("status").notNull().default("pending"), // 'pending', 'in_progress', 'completed', 'rejected'
  statusReason: text("status_reason"), // Reason for rejection if applicable
  processedBy: varchar("processed_by").references(() => users.id),
  processedByUsername: text("processed_by_username"),
  dataSummary: jsonb("data_summary"), // Summary of data found/exported/deleted
  completedAt: timestamp("completed_at"),
  dueDate: timestamp("due_date").notNull(), // Legal deadline (30 days from request)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("gdpr_requests_status_idx").on(table.status),
  dueDateIdx: index("gdpr_requests_due_date_idx").on(table.dueDate),
}));

export const insertGdprDataRequestSchema = createInsertSchema(gdprDataRequests).omit({
  id: true,
  createdAt: true,
});

export type InsertGdprDataRequest = z.infer<typeof insertGdprDataRequestSchema>;
export type GdprDataRequest = typeof gdprDataRequests.$inferSelect;

// GDPR Data Retention Policy - defines retention periods for different data types
export const gdprRetentionPolicies = pgTable("gdpr_retention_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dataCategory: text("data_category").notNull().unique(), // 'audit_logs', 'session_history', 'ai_logs', etc.
  retentionDays: integer("retention_days").notNull(), // Days to retain
  legalBasis: text("legal_basis").notNull(), // 'legitimate_interests', 'legal_obligation', 'consent'
  description: text("description"),
  lastPurgeAt: timestamp("last_purge_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGdprRetentionPolicySchema = createInsertSchema(gdprRetentionPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGdprRetentionPolicy = z.infer<typeof insertGdprRetentionPolicySchema>;
export type GdprRetentionPolicy = typeof gdprRetentionPolicies.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// SHIFT HANDOVER NOTES
// ═══════════════════════════════════════════════════════════════════════════

export const shiftHandovers = pgTable("shift_handovers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").notNull().references(() => users.id),
  authorName: text("author_name").notNull(),
  shiftDate: text("shift_date").notNull(), // DD/MM/YYYY
  shiftType: text("shift_type").notNull(), // 'morning', 'afternoon', 'night'
  summary: text("summary").notNull(),
  keyEvents: text("key_events"),
  medicationNotes: text("medication_notes"),
  clientConcerns: text("client_concerns"),
  staffingNotes: text("staffing_notes"),
  followUpRequired: boolean("follow_up_required").notNull().default(false),
  followUpDetails: text("follow_up_details"),
  priority: text("priority").notNull().default("normal"), // 'low', 'normal', 'high', 'urgent'
  acknowledgedBy: jsonb("acknowledged_by").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShiftHandoverSchema = createInsertSchema(shiftHandovers).omit({
  id: true,
  createdAt: true,
});

export type InsertShiftHandover = z.infer<typeof insertShiftHandoverSchema>;
export type ShiftHandover = typeof shiftHandovers.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// STAFF TRAINING TRACKER
// ═══════════════════════════════════════════════════════════════════════════

export const staffTraining = pgTable("staff_training", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: varchar("staff_id").notNull().references(() => users.id),
  staffName: text("staff_name").notNull(),
  courseName: text("course_name").notNull(),
  category: text("category").notNull().default("mandatory"), // 'mandatory', 'recommended', 'specialist'
  provider: text("provider"),
  completedDate: text("completed_date"), // DD/MM/YYYY or null if not yet completed
  expiryDate: text("expiry_date"), // DD/MM/YYYY
  status: text("status").notNull().default("pending"), // 'pending', 'completed', 'expired', 'expiring_soon'
  certificateRef: text("certificate_ref"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStaffTrainingSchema = createInsertSchema(staffTraining).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStaffTraining = z.infer<typeof insertStaffTrainingSchema>;
export type StaffTraining = typeof staffTraining.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// POLICY ACKNOWLEDGEMENTS
// ═══════════════════════════════════════════════════════════════════════════

export const policyAcknowledgements = pgTable("policy_acknowledgements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id").notNull().references(() => policyDocuments.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  userName: text("user_name").notNull(),
  acknowledgedAt: timestamp("acknowledged_at").notNull().defaultNow(),
  signatureName: text("signature_name").notNull(),
});

export const insertPolicyAcknowledgementSchema = createInsertSchema(policyAcknowledgements).omit({
  id: true,
  acknowledgedAt: true,
});

export type InsertPolicyAcknowledgement = z.infer<typeof insertPolicyAcknowledgementSchema>;
export type PolicyAcknowledgement = typeof policyAcknowledgements.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// APPLICATION SETTINGS TABLE
// ═══════════════════════════════════════════════════════════════════════════

// Key-value store for persistent application settings
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(), // Setting name: 'ai_provider', 'ai_model', 'emar_agent', etc.
  value: text("value").notNull(), // Setting value as string
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertAppSettingSchema = createInsertSchema(appSettings).omit({
  updatedAt: true,
});

export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type AppSetting = typeof appSettings.$inferSelect;
