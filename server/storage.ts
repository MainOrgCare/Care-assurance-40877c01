import { eq, and, desc, sql, inArray, or, ilike, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import bcrypt from "bcrypt";
import {
  type User,
  type InsertUser,
  type CareWorker,
  type InsertCareWorker,
  type Discrepancy,
  type InsertDiscrepancy,
  type Audit,
  type InsertAudit,
  type CareWorkerRota,
  type InsertCareWorkerRota,
  type RosteringTemplateRecommendation,
  type InsertRosteringTemplateRecommendation,
  type AdminAlert,
  type InsertAdminAlert,
  type ActiveSession,
  type InsertActiveSession,
  type RiskAssessmentLog,
  type InsertRiskAssessmentLog,
  type SessionHistory,
  type InsertSessionHistory,
  type SuspensionLog,
  type InsertSuspensionLog,
  type PolicyDocument,
  type InsertPolicyDocument,
  type InsertSystemLog,
  type SystemLog,
  type BlockedIp,
  type InsertBlockedIp,
  type EmarRefusalReview,
  type InsertEmarRefusalReview,
  type FileScanLog,
  type InsertFileScanLog,
  type EmarCorrection,
  type InsertEmarCorrection,
  type AiUsageLog,
  type InsertAiUsageLog,
  type ContactMessage,
  type InsertContactMessage,
  type UserMessage,
  type InsertUserMessage,
  type RosteringRecommendedCallTime,
  type InsertRosteringRecommendedCallTime,
  type RosteringWorkerStartTime,
  type InsertRosteringWorkerStartTime,
  type RosteringWorkerTemplate,
  type InsertRosteringWorkerTemplate,
  type RosteringWorkerConstraint,
  type InsertRosteringWorkerConstraint,
  type RosteringSavedState,
  type InsertRosteringSavedState,
  // New extracted data types
  type AnalyzedServiceUser,
  type InsertAnalyzedServiceUser,
  type AnalyzedCareWorker,
  type InsertAnalyzedCareWorker,
  type ServiceOrder,
  type InsertServiceOrder,
  type TemplateAssignment,
  type InsertTemplateAssignment,
  type AnalyzedCall,
  type InsertAnalyzedCall,
  type CallRecommendation,
  type InsertCallRecommendation,
  type WorkbookUpload,
  type InsertWorkbookUpload,
  users,
  careWorkers,
  discrepancies,
  audits,
  careWorkerRotas,
  rosteringTemplateRecommendations,
  adminAlerts,
  activeSessions,
  riskAssessmentLogs,
  sessionHistory,
  suspensionLogs,
  policyDocuments,
  systemLogs,
  blockedIps,
  emarRefusalReviews,
  fileScanLogs,
  emarCorrections,
  aiUsageLogs,
  contactMessages,
  userMessages,
  rosteringRecommendedCallTimes,
  rosteringWorkerStartTimes,
  rosteringWorkerTemplates,
  rosteringWorkerConstraints,
  rosteringSavedStates,
  // New extracted data tables
  analyzedServiceUsers,
  analyzedCareWorkers,
  serviceOrders,
  templateAssignments,
  analyzedCalls,
  callRecommendations,
  workbookUploads,
} from "@shared/schema";

const SALT_ROUNDS = 10;

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getPendingUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
  updateUserStatus(id: string, status: string): Promise<User | undefined>;
  updateUserJobTitle(id: string, jobTitle: string): Promise<User | undefined>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  // Care Worker operations
  getCareWorker(id: string): Promise<CareWorker | undefined>;
  getCareWorkerByInitials(initials: string): Promise<CareWorker | undefined>;
  getAllCareWorkers(): Promise<CareWorker[]>;
  createCareWorker(worker: InsertCareWorker): Promise<CareWorker>;
  updateCareWorker(id: string, worker: Partial<InsertCareWorker>): Promise<CareWorker | undefined>;

  // Discrepancy operations
  getDiscrepanciesByCareWorker(careWorkerId: string): Promise<Discrepancy[]>;
  getDiscrepancyCountByType(careWorkerId: string, type: string): Promise<number>;
  createDiscrepancy(discrepancy: InsertDiscrepancy): Promise<Discrepancy>;
  getAllDiscrepancies(): Promise<(Discrepancy & { careWorker: CareWorker })[]>;

  // Audit operations
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAuditsByServiceUser(serviceUserName: string): Promise<Audit[]>;
  getAllAudits(): Promise<Audit[]>;

  // Care Worker Rota operations
  upsertCareWorkerRota(rota: InsertCareWorkerRota): Promise<{ rota: CareWorkerRota; deduped: boolean }>;
  getCareWorkerRotaByHash(sourceHash: string): Promise<CareWorkerRota | undefined>;
  getCareWorkerRotas(options?: { search?: string }): Promise<CareWorkerRota[]>;

  // Rostering template recommendation operations
  upsertRosteringTemplateRecommendation(
    recommendation: InsertRosteringTemplateRecommendation
  ): Promise<RosteringTemplateRecommendation | null>;
  getRosteringTemplateRecommendations(options: {
    workerKey: string;
    templateWeek: string;
    templateDay: string;
  }): Promise<RosteringTemplateRecommendation[]>;
  deleteRosteringTemplateRecommendations(options: {
    workerKey: string;
    templateWeek: string;
    templateDay: string;
    groupKeys: string[];
  }): Promise<number>;

  // Admin Alert operations
  createAdminAlert(alert: InsertAdminAlert): Promise<AdminAlert>;
  getUnreadAdminAlerts(): Promise<AdminAlert[]>;
  markAlertAsRead(id: string): Promise<void>;

  // Active Session operations
  createActiveSession(session: InsertActiveSession): Promise<ActiveSession>;
  getActiveSessionByUserId(userId: string): Promise<ActiveSession | undefined>;
  getActiveSessionBySessionId(sessionId: string): Promise<ActiveSession | undefined>;
  getAllActiveSessions(): Promise<ActiveSession[]>;
  getNonAdminActiveSessions(): Promise<ActiveSession[]>;
  updateSessionActivity(sessionId: string): Promise<void>;
  deleteActiveSession(sessionId: string): Promise<void>;
  deleteActiveSessionByUserId(userId: string): Promise<void>;
  getActiveSessionCount(): Promise<number>;
  getNonAdminSessionCount(): Promise<number>;

  // Risk Assessment Log operations
  createRiskAssessmentLog(log: InsertRiskAssessmentLog): Promise<RiskAssessmentLog>;
  getAllRiskAssessmentLogs(): Promise<RiskAssessmentLog[]>;
  getRiskAssessmentLogsByServiceUser(serviceUserInitials: string): Promise<RiskAssessmentLog[]>;

  // Session History operations
  createSessionHistory(log: InsertSessionHistory): Promise<SessionHistory>;
  getSessionHistoryByUser(userId: string): Promise<SessionHistory[]>;
  getAllSessionHistory(): Promise<SessionHistory[]>;
  updateSessionLogout(sessionId: string, terminatedByAdmin?: boolean): Promise<void>;

  // Suspension Log operations
  createSuspensionLog(log: InsertSuspensionLog): Promise<SuspensionLog>;
  getSuspensionLogs(): Promise<SuspensionLog[]>;
  getSuspensionLogsByUser(userId: string): Promise<SuspensionLog[]>;
  reinstateSuspension(id: string): Promise<SuspensionLog | undefined>;

  // Enhanced User operations
  updateUserName(id: string, firstName: string | null, lastName: string | null): Promise<User | undefined>;
  updateUsername(id: string, username: string): Promise<User | undefined>;
  suspendUser(id: string, suspendedUntil: Date | null): Promise<User | undefined>;
  updateLastOnlineAt(id: string): Promise<User | undefined>;
  
  // Dashboard operations
  updateDashboardWidgets(id: string, widgets: string[]): Promise<User | undefined>;
  getDashboardWidgets(id: string): Promise<string[] | null>;
  
  // Password operations
  updateUserPassword(id: string, hashedPassword: string): Promise<User | undefined>;
  
  // Terms acceptance operations
  updateUserTermsAcceptance(id: string, version: string, signatureName: string, signatureDate: string): Promise<User | undefined>;

  // Policy Document operations
  createPolicyDocument(doc: InsertPolicyDocument): Promise<PolicyDocument>;
  getPolicyDocumentsByCategory(category: string): Promise<PolicyDocument[]>;
  getAllPolicyDocuments(): Promise<PolicyDocument[]>;
  updatePolicyDocument(id: string, doc: Partial<InsertPolicyDocument>): Promise<PolicyDocument | undefined>;
  deletePolicyDocument(id: string): Promise<void>;

  // System Log operations
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  getSystemLogs(): Promise<SystemLog[]>;
  getSystemLogsPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
  }): Promise<{ logs: SystemLog[]; total: number; page: number; totalPages: number }>;

  // Blocked IP operations
  blockIp(blockedIp: InsertBlockedIp): Promise<BlockedIp>;
  unblockIp(id: string): Promise<void>;
  isIpBlocked(ipAddress: string): Promise<boolean>;
  getBlockedIpByAddress(ipAddress: string): Promise<BlockedIp | undefined>;
  getAllBlockedIps(): Promise<BlockedIp[]>;

  // EMAR Refusal Review operations
  createRefusalReview(review: InsertEmarRefusalReview): Promise<EmarRefusalReview>;
  getRefusalReviewsByAudit(auditId: string): Promise<EmarRefusalReview[]>;
  updateRefusalReview(id: string, reasonAcceptable: boolean, reviewedBy: string, notes?: string): Promise<EmarRefusalReview | undefined>;
  getAllRefusalReviews(): Promise<EmarRefusalReview[]>;

  // File Scan Log operations
  createFileScanLog(log: InsertFileScanLog): Promise<FileScanLog>;
  getFileScanLogByHash(fileHash: string): Promise<FileScanLog | undefined>;
  getAllFileScanLogs(): Promise<FileScanLog[]>;

  // EMAR Correction operations
  createEmarCorrection(correction: InsertEmarCorrection): Promise<EmarCorrection>;
  getRecentEmarCorrections(limit?: number): Promise<EmarCorrection[]>;
  
  // AI Usage Log operations
  createAiUsageLog(log: InsertAiUsageLog): Promise<AiUsageLog>;
  getAiUsageLogs(options?: { limit?: number; startDate?: Date; endDate?: Date }): Promise<AiUsageLog[]>;
  getAiUsageStats(): Promise<{ totalCost: number; totalCalls: number; byFeature: Record<string, { calls: number; cost: number; tokens: number }> }>;

  // Contact Message operations
  createContactMessage(message: InsertContactMessage): Promise<ContactMessage>;
  getContactMessages(includeArchived?: boolean): Promise<ContactMessage[]>;
  markContactMessageRead(id: string, readBy: string): Promise<ContactMessage | undefined>;
  archiveContactMessage(id: string): Promise<ContactMessage | undefined>;
  deleteContactMessage(id: string): Promise<void>;
  getUnreadContactMessageCount(): Promise<number>;

  // User Message operations (internal messaging portal)
  createUserMessage(message: InsertUserMessage): Promise<UserMessage>;
  getUserMessages(recipientId: string, includeArchived?: boolean): Promise<UserMessage[]>;
  getUserMessage(id: string): Promise<UserMessage | undefined>;
  markUserMessageRead(id: string): Promise<UserMessage | undefined>;
  archiveUserMessage(id: string): Promise<UserMessage | undefined>;
  deleteUserMessage(id: string): Promise<void>;
  getUnreadUserMessageCount(recipientId: string): Promise<number>;

  // Rostering Recommended Call Times
  upsertRosteringRecommendedCallTime(callTime: InsertRosteringRecommendedCallTime): Promise<RosteringRecommendedCallTime>;
  getRosteringRecommendedCallTimes(workbookId: string): Promise<RosteringRecommendedCallTime[]>;
  getRosteringRecommendedCallTimesByServiceUser(workbookId: string, serviceUserKey: string): Promise<RosteringRecommendedCallTime[]>;
  deleteRosteringRecommendedCallTime(id: string): Promise<void>;
  deleteRosteringRecommendedCallTimesByWorkbook(workbookId: string): Promise<number>;

  // Rostering Worker Start Times
  upsertRosteringWorkerStartTime(startTime: InsertRosteringWorkerStartTime): Promise<RosteringWorkerStartTime>;
  getRosteringWorkerStartTimes(workbookId: string): Promise<RosteringWorkerStartTime[]>;
  getRosteringWorkerStartTimesByWorker(workbookId: string, workerKey: string): Promise<RosteringWorkerStartTime[]>;
  deleteRosteringWorkerStartTime(id: string): Promise<void>;
  deleteRosteringWorkerStartTimesByWorkbook(workbookId: string): Promise<number>;

  // Rostering Worker Templates (who visits whom)
  upsertRosteringWorkerTemplate(template: InsertRosteringWorkerTemplate): Promise<RosteringWorkerTemplate>;
  getRosteringWorkerTemplates(workbookId: string): Promise<RosteringWorkerTemplate[]>;
  getRosteringWorkerTemplatesByWorker(workbookId: string, workerKey: string): Promise<RosteringWorkerTemplate[]>;
  getRosteringWorkerTemplatesByServiceUser(workbookId: string, serviceUserKey: string): Promise<RosteringWorkerTemplate[]>;
  deleteRosteringWorkerTemplate(id: string): Promise<void>;
  deleteRosteringWorkerTemplatesByWorkbook(workbookId: string): Promise<number>;

  // Rostering Worker Constraints (max calls per worker)
  upsertRosteringWorkerConstraint(constraint: InsertRosteringWorkerConstraint): Promise<RosteringWorkerConstraint>;
  getRosteringWorkerConstraints(workbookId: string): Promise<RosteringWorkerConstraint[]>;
  getRosteringWorkerConstraintByWorker(workbookId: string, workerKey: string): Promise<RosteringWorkerConstraint | undefined>;
  deleteRosteringWorkerConstraint(id: string): Promise<void>;
  deleteRosteringWorkerConstraintsByWorkbook(workbookId: string): Promise<number>;

  // Rostering Saved States (persisted schedules)
  createRosteringSavedState(state: InsertRosteringSavedState): Promise<RosteringSavedState>;
  updateRosteringSavedState(id: string, updates: Partial<InsertRosteringSavedState>): Promise<RosteringSavedState | undefined>;
  getRosteringSavedStates(workbookId: string): Promise<RosteringSavedState[]>;
  getRosteringSavedState(id: string): Promise<RosteringSavedState | undefined>;
  getActiveRosteringSavedState(workbookId: string, templateWeek: string, templateDay: string): Promise<RosteringSavedState | undefined>;
  setActiveRosteringSavedState(id: string, workbookId: string): Promise<RosteringSavedState | undefined>;
  deleteRosteringSavedState(id: string): Promise<void>;
  deleteRosteringSavedStatesByWorkbook(workbookId: string): Promise<number>;

  // =========================================================================
  // EXTRACTED DATA - Service Users, Care Workers, Calls, Orders, Templates
  // =========================================================================

  // Workbook Uploads (metadata only)
  createWorkbookUpload(upload: InsertWorkbookUpload): Promise<WorkbookUpload>;
  getWorkbookUpload(id: string): Promise<WorkbookUpload | undefined>;
  getWorkbookUploadByHash(fileHash: string): Promise<WorkbookUpload | undefined>;
  getAllWorkbookUploads(): Promise<WorkbookUpload[]>;
  updateWorkbookUploadStatus(id: string, status: string, error?: string): Promise<WorkbookUpload | undefined>;
  deleteWorkbookUpload(id: string): Promise<void>;

  // Analyzed Service Users
  upsertAnalyzedServiceUser(serviceUser: InsertAnalyzedServiceUser): Promise<AnalyzedServiceUser>;
  getAnalyzedServiceUser(serviceUserKey: string): Promise<AnalyzedServiceUser | undefined>;
  getAllAnalyzedServiceUsers(): Promise<AnalyzedServiceUser[]>;
  deleteAnalyzedServiceUser(id: string): Promise<void>;
  cleanupExpiredServiceUsers(): Promise<number>;

  // Analyzed Care Workers
  upsertAnalyzedCareWorker(careWorker: InsertAnalyzedCareWorker): Promise<AnalyzedCareWorker>;
  getAnalyzedCareWorker(workerKey: string): Promise<AnalyzedCareWorker | undefined>;
  getAllAnalyzedCareWorkers(): Promise<AnalyzedCareWorker[]>;
  deleteAnalyzedCareWorker(id: string): Promise<void>;
  cleanupExpiredCareWorkers(): Promise<number>;

  // Service Orders
  upsertServiceOrder(order: InsertServiceOrder): Promise<ServiceOrder>;
  getServiceOrdersByServiceUser(serviceUserKey: string): Promise<ServiceOrder[]>;
  getAllServiceOrders(): Promise<ServiceOrder[]>;
  deleteServiceOrder(id: string): Promise<void>;
  cleanupExpiredServiceOrders(): Promise<number>;

  // Template Assignments
  upsertTemplateAssignment(assignment: InsertTemplateAssignment): Promise<TemplateAssignment>;
  getTemplateAssignmentsByWorker(workerKey: string): Promise<TemplateAssignment[]>;
  getTemplateAssignmentsByServiceUser(serviceUserKey: string): Promise<TemplateAssignment[]>;
  getTemplateAssignmentsForDay(templateWeek: string, templateDay: string): Promise<TemplateAssignment[]>;
  getAllTemplateAssignments(): Promise<TemplateAssignment[]>;
  deleteTemplateAssignmentsForSlot(serviceUserKey: string, callTypeLabel: string, templateWeek: string, templateDay: string): Promise<number>;
  deleteTemplateAssignment(id: string): Promise<void>;
  cleanupExpiredTemplateAssignments(): Promise<number>;

  // Analyzed Calls
  bulkInsertAnalyzedCalls(calls: InsertAnalyzedCall[]): Promise<number>;
  getAllAnalyzedCalls(): Promise<AnalyzedCall[]>;
  getAnalyzedCallsByServiceUser(serviceUserKey: string): Promise<AnalyzedCall[]>;
  getAnalyzedCallsByWorker(workerKey: string): Promise<AnalyzedCall[]>;
  getAnalyzedCallsByDateRange(startDate: string, endDate: string): Promise<AnalyzedCall[]>;
  deleteAnalyzedCall(id: string): Promise<void>;
  cleanupExpiredCalls(): Promise<number>;

  // Call Recommendations
  upsertCallRecommendation(recommendation: InsertCallRecommendation): Promise<CallRecommendation>;
  getCallRecommendationsByServiceUser(serviceUserKey: string): Promise<CallRecommendation[]>;
  getPendingCallRecommendations(): Promise<CallRecommendation[]>;
  applyCallRecommendation(id: string, appliedBy: string): Promise<CallRecommendation | undefined>;
  deleteCallRecommendation(id: string): Promise<void>;
  cleanupExpiredRecommendations(): Promise<number>;

  // Bulk cleanup of all expired data
  cleanupAllExpiredData(): Promise<{ serviceUsers: number; careWorkers: number; calls: number; orders: number; templates: number; recommendations: number }>;

  // Hard reset of all rostering data
  resetRosteringData(): Promise<{
    careWorkerRotas: number;
    recommendedCallTimes: number;
    workerStartTimes: number;
    workerTemplates: number;
    workerConstraints: number;
    savedStates: number;
    analyzedServiceUsers: number;
    analyzedCareWorkers: number;
    analyzedCalls: number;
    serviceOrders: number;
    templateAssignments: number;
    callRecommendations: number;
    workbookUploads: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  private db;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.db = drizzle(pool);
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`);
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await this.db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getPendingUsers(): Promise<User[]> {
    return await this.db
      .select()
      .from(users)
      .where(eq(users.status, "pending"))
      .orderBy(desc(users.createdAt));
  }

  async createUser(user: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);
    const result = await this.db.insert(users).values({
      ...user,
      password: hashedPassword,
    }).returning();
    return result[0];
  }

  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async updateUserStatus(id: string, status: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ status })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateUserJobTitle(id: string, jobTitle: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ jobTitle })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<void> {
    // Delete related records first to avoid foreign key constraint errors
    await this.db.delete(sessionHistory).where(eq(sessionHistory.userId, id));
    await this.db.delete(activeSessions).where(eq(activeSessions.userId, id));
    await this.db.delete(suspensionLogs).where(eq(suspensionLogs.userId, id));
    // Note: riskAssessmentLogs does not have userId field, so we don't need to delete those
    // Now delete the user
    await this.db.delete(users).where(eq(users.id, id));
  }

  // Care Worker operations
  async getCareWorker(id: string): Promise<CareWorker | undefined> {
    const result = await this.db
      .select()
      .from(careWorkers)
      .where(eq(careWorkers.id, id));
    return result[0];
  }

  async getCareWorkerByInitials(initials: string): Promise<CareWorker | undefined> {
    if (!initials || initials.length < 2) return undefined;
    
    // Match format like "L.Barron" where initials "LB" = first char + first char of last name
    const pattern = `${initials[0]}.${initials.slice(1)}%`;
    const result = await this.db
      .select()
      .from(careWorkers)
      .where(ilike(careWorkers.name, pattern))
      .limit(1);
    return result[0];
  }

  async getAllCareWorkers(): Promise<CareWorker[]> {
    return await this.db.select().from(careWorkers).orderBy(careWorkers.name);
  }

  async createCareWorker(worker: InsertCareWorker): Promise<CareWorker> {
    const result = await this.db.insert(careWorkers).values(worker).returning();
    return result[0];
  }

  async updateCareWorker(
    id: string,
    worker: Partial<InsertCareWorker>
  ): Promise<CareWorker | undefined> {
    const result = await this.db
      .update(careWorkers)
      .set(worker)
      .where(eq(careWorkers.id, id))
      .returning();
    return result[0];
  }

  // Discrepancy operations
  async getDiscrepanciesByCareWorker(careWorkerId: string): Promise<Discrepancy[]> {
    return await this.db
      .select()
      .from(discrepancies)
      .where(eq(discrepancies.careWorkerId, careWorkerId))
      .orderBy(desc(discrepancies.createdAt));
  }

  async getDiscrepancyCountByType(careWorkerId: string, type: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(discrepancies)
      .where(
        and(
          eq(discrepancies.careWorkerId, careWorkerId),
          eq(discrepancies.type, type)
        )
      );
    return Number(result[0].count);
  }

  async createDiscrepancy(discrepancy: InsertDiscrepancy): Promise<Discrepancy> {
    const result = await this.db
      .insert(discrepancies)
      .values(discrepancy)
      .returning();
    return result[0];
  }

  async getAllDiscrepancies(): Promise<(Discrepancy & { careWorker: CareWorker })[]> {
    const result = await this.db
      .select()
      .from(discrepancies)
      .innerJoin(careWorkers, eq(discrepancies.careWorkerId, careWorkers.id))
      .orderBy(desc(discrepancies.createdAt));

    return result.map((row) => ({
      ...row.discrepancies,
      careWorker: row.care_workers,
    }));
  }

  // Audit operations
  async createAudit(audit: InsertAudit): Promise<Audit> {
    const result = await this.db.insert(audits).values(audit).returning();
    return result[0];
  }

  async getAuditsByServiceUser(serviceUserName: string): Promise<Audit[]> {
    return await this.db
      .select()
      .from(audits)
      .where(eq(audits.serviceUserName, serviceUserName))
      .orderBy(desc(audits.createdAt));
  }

  async getAllAudits(): Promise<Audit[]> {
    return await this.db
      .select()
      .from(audits)
      .orderBy(desc(audits.createdAt));
  }

  // Care Worker Rota operations
  async upsertCareWorkerRota(rota: InsertCareWorkerRota): Promise<{ rota: CareWorkerRota; deduped: boolean }> {
    const inserted = await this.db
      .insert(careWorkerRotas)
      .values(rota)
      .onConflictDoNothing({ target: careWorkerRotas.sourceHash })
      .returning();

    if (inserted.length) {
      return { rota: inserted[0], deduped: false };
    }

    const existing = await this.getCareWorkerRotaByHash(rota.sourceHash);
    if (!existing) {
      throw new Error("Unable to save care worker rota.");
    }
    return { rota: existing, deduped: true };
  }

  async getCareWorkerRotaByHash(sourceHash: string): Promise<CareWorkerRota | undefined> {
    const result = await this.db
      .select()
      .from(careWorkerRotas)
      .where(eq(careWorkerRotas.sourceHash, sourceHash))
      .limit(1);
    return result[0];
  }

  async getCareWorkerRotaById(id: string): Promise<CareWorkerRota | undefined> {
    const result = await this.db
      .select()
      .from(careWorkerRotas)
      .where(eq(careWorkerRotas.id, id))
      .limit(1);
    return result[0];
  }

  async getCareWorkerRotas(options?: { search?: string }): Promise<CareWorkerRota[]> {
    const term = options?.search?.trim().toLowerCase();
    if (term) {
      return await this.db
        .select()
        .from(careWorkerRotas)
        .where(
          sql`lower(${careWorkerRotas.workerName}) like ${`%${term}%`} or lower(${careWorkerRotas.workerKey}) like ${`%${term}%`}`
        )
        .orderBy(desc(careWorkerRotas.createdAt));
    }

    return await this.db
      .select()
      .from(careWorkerRotas)
      .orderBy(desc(careWorkerRotas.createdAt));
  }

  async updateCareWorkerRota(
    id: string,
    update: Partial<InsertCareWorkerRota>
  ): Promise<CareWorkerRota> {
    const payload: Partial<InsertCareWorkerRota> = {};

    if (update.workerName !== undefined) payload.workerName = update.workerName;
    if (update.workerKey !== undefined) payload.workerKey = update.workerKey;
    if (update.templateWeek !== undefined) payload.templateWeek = update.templateWeek;
    if (update.templateDay !== undefined) payload.templateDay = update.templateDay;
    if (update.payload !== undefined) payload.payload = update.payload;
    if (update.sourceHash !== undefined) payload.sourceHash = update.sourceHash;
    if (update.createdBy !== undefined) payload.createdBy = update.createdBy;
    if (update.createdByUsername !== undefined) payload.createdByUsername = update.createdByUsername;

    const updated = await this.db
      .update(careWorkerRotas)
      .set(payload)
      .where(eq(careWorkerRotas.id, id))
      .returning();

    if (!updated.length) {
      throw new Error("Care worker rota not found");
    }

    return updated[0];
  }

  // Rostering template recommendation operations
  async upsertRosteringTemplateRecommendation(
    recommendation: InsertRosteringTemplateRecommendation
  ): Promise<RosteringTemplateRecommendation | null> {
    const inserted = await this.db
      .insert(rosteringTemplateRecommendations)
      .values(recommendation)
      .onConflictDoNothing({
        target: [
          rosteringTemplateRecommendations.workerKey,
          rosteringTemplateRecommendations.templateWeek,
          rosteringTemplateRecommendations.templateDay,
          rosteringTemplateRecommendations.groupKey,
        ],
      })
      .returning();
    return inserted[0] ?? null;
  }

  async getRosteringTemplateRecommendations(options: {
    workerKey: string;
    templateWeek: string;
    templateDay: string;
  }): Promise<RosteringTemplateRecommendation[]> {
    return await this.db
      .select()
      .from(rosteringTemplateRecommendations)
      .where(
        and(
          eq(rosteringTemplateRecommendations.workerKey, options.workerKey),
          eq(rosteringTemplateRecommendations.templateWeek, options.templateWeek),
          eq(rosteringTemplateRecommendations.templateDay, options.templateDay)
        )
      )
      .orderBy(desc(rosteringTemplateRecommendations.createdAt));
  }

  async deleteRosteringTemplateRecommendations(options: {
    workerKey: string;
    templateWeek: string;
    templateDay: string;
    groupKeys: string[];
  }): Promise<number> {
    if (!options.groupKeys.length) return 0;
    const deleted = await this.db
      .delete(rosteringTemplateRecommendations)
      .where(
        and(
          eq(rosteringTemplateRecommendations.workerKey, options.workerKey),
          eq(rosteringTemplateRecommendations.templateWeek, options.templateWeek),
          eq(rosteringTemplateRecommendations.templateDay, options.templateDay),
          inArray(rosteringTemplateRecommendations.groupKey, options.groupKeys)
        )
      )
      .returning({ id: rosteringTemplateRecommendations.id });
    return deleted.length;
  }

  // Admin Alert operations
  async createAdminAlert(alert: InsertAdminAlert): Promise<AdminAlert> {
    const result = await this.db.insert(adminAlerts).values(alert).returning();
    return result[0];
  }

  async getUnreadAdminAlerts(): Promise<AdminAlert[]> {
    return await this.db
      .select()
      .from(adminAlerts)
      .where(eq(adminAlerts.isRead, false))
      .orderBy(desc(adminAlerts.createdAt));
  }

  async markAlertAsRead(id: string): Promise<void> {
    await this.db
      .update(adminAlerts)
      .set({ isRead: true })
      .where(eq(adminAlerts.id, id));
  }

  // Active Session operations
  async createActiveSession(session: InsertActiveSession): Promise<ActiveSession> {
    await this.db.delete(activeSessions).where(eq(activeSessions.userId, session.userId));
    const result = await this.db.insert(activeSessions).values(session).returning();
    return result[0];
  }

  async getActiveSessionByUserId(userId: string): Promise<ActiveSession | undefined> {
    const result = await this.db
      .select()
      .from(activeSessions)
      .where(eq(activeSessions.userId, userId));
    return result[0];
  }

  async getActiveSessionBySessionId(sessionId: string): Promise<ActiveSession | undefined> {
    const result = await this.db
      .select()
      .from(activeSessions)
      .where(eq(activeSessions.sessionId, sessionId));
    return result[0];
  }

  async getAllActiveSessions(): Promise<ActiveSession[]> {
    return await this.db.select().from(activeSessions).orderBy(desc(activeSessions.lastActivity));
  }

  async getNonAdminActiveSessions(): Promise<ActiveSession[]> {
    return await this.db
      .select()
      .from(activeSessions)
      .where(sql`${activeSessions.role} != 'admin'`)
      .orderBy(activeSessions.lastActivity);
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    await this.db
      .update(activeSessions)
      .set({ lastActivity: new Date() })
      .where(eq(activeSessions.sessionId, sessionId));
  }

  async deleteActiveSession(sessionId: string): Promise<void> {
    await this.db.delete(activeSessions).where(eq(activeSessions.sessionId, sessionId));
  }

  async deleteActiveSessionByUserId(userId: string): Promise<void> {
    await this.db.delete(activeSessions).where(eq(activeSessions.userId, userId));
  }

  async getActiveSessionCount(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(activeSessions);
    return Number(result[0].count);
  }

  async getNonAdminSessionCount(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(activeSessions)
      .where(sql`${activeSessions.role} != 'admin'`);
    return Number(result[0].count);
  }

  // Risk Assessment Log operations
  async createRiskAssessmentLog(log: InsertRiskAssessmentLog): Promise<RiskAssessmentLog> {
    const result = await this.db.insert(riskAssessmentLogs).values(log).returning();
    return result[0];
  }

  async getAllRiskAssessmentLogs(): Promise<RiskAssessmentLog[]> {
    return await this.db
      .select()
      .from(riskAssessmentLogs)
      .orderBy(desc(riskAssessmentLogs.createdAt));
  }

  async getRiskAssessmentLogsByServiceUser(serviceUserInitials: string): Promise<RiskAssessmentLog[]> {
    return await this.db
      .select()
      .from(riskAssessmentLogs)
      .where(eq(riskAssessmentLogs.serviceUserInitials, serviceUserInitials))
      .orderBy(desc(riskAssessmentLogs.createdAt));
  }

  // Session History operations
  async createSessionHistory(log: InsertSessionHistory): Promise<SessionHistory> {
    const result = await this.db.insert(sessionHistory).values(log).returning();
    return result[0];
  }

  async getSessionHistoryByUser(userId: string): Promise<SessionHistory[]> {
    return await this.db
      .select()
      .from(sessionHistory)
      .where(eq(sessionHistory.userId, userId))
      .orderBy(desc(sessionHistory.loggedInAt));
  }

  async getAllSessionHistory(): Promise<SessionHistory[]> {
    return await this.db
      .select()
      .from(sessionHistory)
      .orderBy(desc(sessionHistory.loggedInAt));
  }

  async updateSessionLogout(sessionId: string, terminatedByAdmin: boolean = false): Promise<void> {
    const now = new Date();
    const record = await this.db
      .select()
      .from(sessionHistory)
      .where(eq(sessionHistory.sessionId, sessionId));
    
    if (record.length > 0 && record[0].loggedInAt) {
      const durationSeconds = Math.floor((now.getTime() - new Date(record[0].loggedInAt).getTime()) / 1000);
      await this.db
        .update(sessionHistory)
        .set({ 
          loggedOutAt: now, 
          durationSeconds,
          terminatedByAdmin 
        })
        .where(eq(sessionHistory.sessionId, sessionId));
    }
  }

  // Suspension Log operations
  async createSuspensionLog(log: InsertSuspensionLog): Promise<SuspensionLog> {
    const result = await this.db.insert(suspensionLogs).values(log).returning();
    return result[0];
  }

  async getSuspensionLogs(): Promise<SuspensionLog[]> {
    return await this.db
      .select()
      .from(suspensionLogs)
      .orderBy(desc(suspensionLogs.createdAt));
  }

  async getSuspensionLogsByUser(userId: string): Promise<SuspensionLog[]> {
    return await this.db
      .select()
      .from(suspensionLogs)
      .where(eq(suspensionLogs.userId, userId))
      .orderBy(desc(suspensionLogs.createdAt));
  }

  async reinstateSuspension(id: string): Promise<SuspensionLog | undefined> {
    const result = await this.db
      .update(suspensionLogs)
      .set({ reinstatedEarly: true })
      .where(eq(suspensionLogs.id, id))
      .returning();
    return result[0];
  }

  // Enhanced User operations
  async updateUserName(id: string, firstName: string | null, lastName: string | null): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ firstName, lastName })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateUsername(id: string, username: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ username })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async suspendUser(id: string, suspendedUntil: Date | null): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ suspendedUntil })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateLastOnlineAt(id: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ lastOnlineAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateUserTermsAcceptance(id: string, version: string, signatureName: string, signatureDate: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ 
        termsAcceptedAt: new Date(),
        termsVersion: version,
        termsSignatureName: signatureName,
        termsSignatureDate: signatureDate,
      })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateDashboardWidgets(id: string, widgets: string[]): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ dashboardWidgets: widgets })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async getDashboardWidgets(id: string): Promise<string[] | null> {
    const user = await this.getUser(id);
    return user?.dashboardWidgets as string[] | null;
  }

  async resetAllPerformanceData(): Promise<{ careWorkers: number; discrepancies: number; audits: number; adminAlerts: number }> {
    const careWorkersResult = await this.db.delete(careWorkers).returning();
    const discrepanciesResult = await this.db.delete(discrepancies).returning();
    const auditsResult = await this.db.delete(audits).returning();
    const adminAlertsResult = await this.db.delete(adminAlerts).returning();
    
    return {
      careWorkers: careWorkersResult.length,
      discrepancies: discrepanciesResult.length,
      audits: auditsResult.length,
      adminAlerts: adminAlertsResult.length,
    };
  }

  async getDashboardStats24h(): Promise<{
    auditsCompleted: number;
    activeAlerts: number;
    plansUpdated: number;
    medicationAudits: number;
    carePlanReviews: number;
    riskAssessments: number;
  }> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const auditsResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(audits)
      .where(sql`${audits.createdAt} >= ${twentyFourHoursAgo}`);
    
    const alertsResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(adminAlerts)
      .where(and(
        eq(adminAlerts.isRead, false),
        sql`${adminAlerts.createdAt} >= ${twentyFourHoursAgo}`
      ));
    
    const emarAuditsResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(audits)
      .where(and(
        eq(audits.auditType, 'EMAR'),
        sql`${audits.createdAt} >= ${twentyFourHoursAgo}`
      ));
    
    const visitAuditsResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(audits)
      .where(and(
        eq(audits.auditType, 'Visit'),
        sql`${audits.createdAt} >= ${twentyFourHoursAgo}`
      ));
    
    const riskAssessmentsResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(riskAssessmentLogs)
      .where(sql`${riskAssessmentLogs.createdAt} >= ${twentyFourHoursAgo}`);

    return {
      auditsCompleted: Number(auditsResult[0].count),
      activeAlerts: Number(alertsResult[0].count),
      plansUpdated: Number(visitAuditsResult[0].count),
      medicationAudits: Number(emarAuditsResult[0].count),
      carePlanReviews: Number(visitAuditsResult[0].count),
      riskAssessments: Number(riskAssessmentsResult[0].count),
    };
  }

  async getRecentAlerts24h(): Promise<AdminAlert[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return await this.db
      .select()
      .from(adminAlerts)
      .where(sql`${adminAlerts.createdAt} >= ${twentyFourHoursAgo}`)
      .orderBy(desc(adminAlerts.createdAt))
      .limit(5);
  }

  async createPolicyDocument(doc: InsertPolicyDocument): Promise<PolicyDocument> {
    const result = await this.db.insert(policyDocuments).values(doc).returning();
    return result[0];
  }

  async getPolicyDocumentsByCategory(category: string): Promise<PolicyDocument[]> {
    return await this.db
      .select()
      .from(policyDocuments)
      .where(eq(policyDocuments.category, category))
      .orderBy(desc(policyDocuments.lastUpdated));
  }

  async getAllPolicyDocuments(): Promise<PolicyDocument[]> {
    return await this.db
      .select()
      .from(policyDocuments)
      .orderBy(desc(policyDocuments.lastUpdated));
  }

  async updatePolicyDocument(id: string, doc: Partial<InsertPolicyDocument>): Promise<PolicyDocument | undefined> {
    const result = await this.db
      .update(policyDocuments)
      .set({ ...doc, lastUpdated: new Date() })
      .where(eq(policyDocuments.id, id))
      .returning();
    return result[0];
  }

  async deletePolicyDocument(id: string): Promise<void> {
    await this.db.delete(policyDocuments).where(eq(policyDocuments.id, id));
  }

  // System Log operations
  async createSystemLog(log: InsertSystemLog): Promise<SystemLog> {
    const result = await this.db.insert(systemLogs).values(log).returning();
    return result[0];
  }

  async getSystemLogs(): Promise<SystemLog[]> {
    return await this.db.select().from(systemLogs).orderBy(desc(systemLogs.createdAt));
  }

  async getSystemLogsPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
  }): Promise<{ logs: SystemLog[]; total: number; page: number; totalPages: number }> {
    const { page, limit, search, status } = options;
    const offset = (page - 1) * limit;

    // Build conditions array
    const conditions: any[] = [];

    // Hide noisy request logs from the activity feed
    conditions.push(sql`${systemLogs.eventType} != 'api_request'`);

    // Search filter - searches across username, eventType, and details (as text)
    if (search && search.trim()) {
      const searchPattern = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          ilike(systemLogs.username, searchPattern),
          ilike(systemLogs.eventType, searchPattern),
          ilike(systemLogs.serviceUserInitials, searchPattern),
          sql`LOWER(${systemLogs.details}::text) LIKE ${searchPattern}`
        )
      );
    }

    // Status filter - searches within the details JSON
    if (status && status !== "all") {
      conditions.push(
        sql`LOWER(${systemLogs.details}->>'status') = ${status.toLowerCase()}`
      );
    }

    // Get total count with filters
    const countQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(systemLogs);
    
    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }
    
    const [{ count: total }] = await countQuery;

    // Get paginated results
    const logsQuery = this.db
      .select()
      .from(systemLogs)
      .orderBy(desc(systemLogs.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      logsQuery.where(and(...conditions));
    }

    const logs = await logsQuery;

    return {
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Blocked IP operations
  async blockIp(blockedIp: InsertBlockedIp): Promise<BlockedIp> {
    const result = await this.db.insert(blockedIps).values(blockedIp).returning();
    return result[0];
  }

  async unblockIp(id: string): Promise<void> {
    await this.db.delete(blockedIps).where(eq(blockedIps.id, id));
  }

  async isIpBlocked(ipAddress: string): Promise<boolean> {
    const result = await this.db
      .select()
      .from(blockedIps)
      .where(eq(blockedIps.ipAddress, ipAddress));
    return result.length > 0;
  }

  async getBlockedIpByAddress(ipAddress: string): Promise<BlockedIp | undefined> {
    const result = await this.db
      .select()
      .from(blockedIps)
      .where(eq(blockedIps.ipAddress, ipAddress));
    return result[0];
  }

  async getAllBlockedIps(): Promise<BlockedIp[]> {
    return await this.db
      .select()
      .from(blockedIps)
      .orderBy(desc(blockedIps.createdAt));
  }

  // EMAR Refusal Review operations
  async createRefusalReview(review: InsertEmarRefusalReview): Promise<EmarRefusalReview> {
    const result = await this.db.insert(emarRefusalReviews).values(review).returning();
    return result[0];
  }

  async getRefusalReviewsByAudit(auditId: string): Promise<EmarRefusalReview[]> {
    return await this.db
      .select()
      .from(emarRefusalReviews)
      .where(eq(emarRefusalReviews.auditId, auditId))
      .orderBy(desc(emarRefusalReviews.createdAt));
  }

  async updateRefusalReview(id: string, reasonAcceptable: boolean, reviewedBy: string, notes?: string): Promise<EmarRefusalReview | undefined> {
    const result = await this.db
      .update(emarRefusalReviews)
      .set({ 
        reasonAcceptable, 
        reviewerNotes: notes,
        reviewedBy: reviewedBy,
        reviewedAt: new Date()
      })
      .where(eq(emarRefusalReviews.id, id))
      .returning();
    return result[0];
  }

  async getAllRefusalReviews(): Promise<EmarRefusalReview[]> {
    return await this.db
      .select()
      .from(emarRefusalReviews)
      .orderBy(desc(emarRefusalReviews.createdAt));
  }

  // File Scan Log operations
  async createFileScanLog(log: InsertFileScanLog): Promise<FileScanLog> {
    const result = await this.db.insert(fileScanLogs).values(log).returning();
    return result[0];
  }

  async getFileScanLogByHash(fileHash: string): Promise<FileScanLog | undefined> {
    const result = await this.db
      .select()
      .from(fileScanLogs)
      .where(eq(fileScanLogs.fileHash, fileHash))
      .orderBy(desc(fileScanLogs.scannedAt))
      .limit(1);
    return result[0];
  }

  async getAllFileScanLogs(): Promise<FileScanLog[]> {
    return await this.db
      .select()
      .from(fileScanLogs)
      .orderBy(desc(fileScanLogs.scannedAt));
  }

  // EMAR Correction operations
  async createEmarCorrection(correction: InsertEmarCorrection): Promise<EmarCorrection> {
    const result = await this.db.insert(emarCorrections).values(correction).returning();
    return result[0];
  }

  async getRecentEmarCorrections(limit: number = 50): Promise<EmarCorrection[]> {
    return await this.db
      .select()
      .from(emarCorrections)
      .orderBy(desc(emarCorrections.createdAt))
      .limit(limit);
  }
  
  // AI Usage Log operations
  async createAiUsageLog(log: InsertAiUsageLog): Promise<AiUsageLog> {
    const result = await this.db.insert(aiUsageLogs).values(log).returning();
    return result[0];
  }
  
  async getAiUsageLogs(options?: { limit?: number; startDate?: Date; endDate?: Date }): Promise<AiUsageLog[]> {
    const limit = options?.limit || 100;
    let query = this.db.select().from(aiUsageLogs);
    
    if (options?.startDate && options?.endDate) {
      query = query.where(
        and(
          sql`${aiUsageLogs.createdAt} >= ${options.startDate}`,
          sql`${aiUsageLogs.createdAt} <= ${options.endDate}`
        )
      ) as any;
    }
    
    return await query.orderBy(desc(aiUsageLogs.createdAt)).limit(limit);
  }
  
  async getAiUsageStats(): Promise<{ totalCost: number; totalCalls: number; byFeature: Record<string, { calls: number; cost: number; tokens: number }> }> {
    const logs = await this.db.select().from(aiUsageLogs);
    
    let totalCost = 0;
    let totalCalls = 0;
    const byFeature: Record<string, { calls: number; cost: number; tokens: number }> = {};
    
    for (const log of logs) {
      totalCost += log.costMicroDollars;
      totalCalls++;
      
      if (!byFeature[log.featureName]) {
        byFeature[log.featureName] = { calls: 0, cost: 0, tokens: 0 };
      }
      byFeature[log.featureName].calls++;
      byFeature[log.featureName].cost += log.costMicroDollars;
      byFeature[log.featureName].tokens += log.totalTokens;
    }
    
    return { totalCost, totalCalls, byFeature };
  }

  // Contact Message operations
  async createContactMessage(message: InsertContactMessage): Promise<ContactMessage> {
    const result = await this.db.insert(contactMessages).values(message).returning();
    return result[0];
  }

  async getContactMessages(includeArchived = false): Promise<ContactMessage[]> {
    if (includeArchived) {
      return await this.db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
    }
    return await this.db.select().from(contactMessages)
      .where(eq(contactMessages.isArchived, false))
      .orderBy(desc(contactMessages.createdAt));
  }

  async markContactMessageRead(id: string, readBy: string): Promise<ContactMessage | undefined> {
    const result = await this.db.update(contactMessages)
      .set({ isRead: true, readBy, readAt: new Date() })
      .where(eq(contactMessages.id, id))
      .returning();
    return result[0];
  }

  async archiveContactMessage(id: string): Promise<ContactMessage | undefined> {
    const result = await this.db.update(contactMessages)
      .set({ isArchived: true })
      .where(eq(contactMessages.id, id))
      .returning();
    return result[0];
  }

  async deleteContactMessage(id: string): Promise<void> {
    await this.db.delete(contactMessages).where(eq(contactMessages.id, id));
  }

  async getUnreadContactMessageCount(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` })
      .from(contactMessages)
      .where(and(eq(contactMessages.isRead, false), eq(contactMessages.isArchived, false)));
    return Number(result[0]?.count || 0);
  }

  // User Message operations (internal messaging portal)
  async createUserMessage(message: InsertUserMessage): Promise<UserMessage> {
    const result = await this.db.insert(userMessages).values(message).returning();
    return result[0];
  }

  async getUserMessages(recipientId: string, includeArchived = false): Promise<UserMessage[]> {
    if (includeArchived) {
      return await this.db.select().from(userMessages)
        .where(eq(userMessages.recipientId, recipientId))
        .orderBy(desc(userMessages.createdAt));
    }
    return await this.db.select().from(userMessages)
      .where(and(eq(userMessages.recipientId, recipientId), eq(userMessages.isArchived, false)))
      .orderBy(desc(userMessages.createdAt));
  }

  async getUserMessage(id: string): Promise<UserMessage | undefined> {
    const result = await this.db.select().from(userMessages).where(eq(userMessages.id, id));
    return result[0];
  }

  async markUserMessageRead(id: string): Promise<UserMessage | undefined> {
    const result = await this.db.update(userMessages)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(userMessages.id, id))
      .returning();
    return result[0];
  }

  async archiveUserMessage(id: string): Promise<UserMessage | undefined> {
    const result = await this.db.update(userMessages)
      .set({ isArchived: true })
      .where(eq(userMessages.id, id))
      .returning();
    return result[0];
  }

  async deleteUserMessage(id: string): Promise<void> {
    await this.db.delete(userMessages).where(eq(userMessages.id, id));
  }

  async getUnreadUserMessageCount(recipientId: string): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` })
      .from(userMessages)
      .where(and(eq(userMessages.isRead, false), eq(userMessages.isArchived, false), eq(userMessages.recipientId, recipientId)));
    return Number(result[0]?.count || 0);
  }

  // =========================================================================
  // Rostering Recommended Call Times
  // =========================================================================

  async upsertRosteringRecommendedCallTime(callTime: InsertRosteringRecommendedCallTime): Promise<RosteringRecommendedCallTime> {
    const inserted = await this.db
      .insert(rosteringRecommendedCallTimes)
      .values(callTime)
      .onConflictDoUpdate({
        target: [
          rosteringRecommendedCallTimes.workbookId,
          rosteringRecommendedCallTimes.serviceUserKey,
          rosteringRecommendedCallTimes.callTypeLabel,
        ],
        set: {
          recommendedStartMinutes: callTime.recommendedStartMinutes,
          toleranceMinutes: callTime.toleranceMinutes,
          priority: callTime.priority,
          notes: callTime.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted[0];
  }

  async getRosteringRecommendedCallTimes(workbookId: string): Promise<RosteringRecommendedCallTime[]> {
    return await this.db
      .select()
      .from(rosteringRecommendedCallTimes)
      .where(eq(rosteringRecommendedCallTimes.workbookId, workbookId))
      .orderBy(rosteringRecommendedCallTimes.serviceUserName, rosteringRecommendedCallTimes.callTypeLabel);
  }

  async getRosteringRecommendedCallTimesByServiceUser(workbookId: string, serviceUserKey: string): Promise<RosteringRecommendedCallTime[]> {
    return await this.db
      .select()
      .from(rosteringRecommendedCallTimes)
      .where(
        and(
          eq(rosteringRecommendedCallTimes.workbookId, workbookId),
          eq(rosteringRecommendedCallTimes.serviceUserKey, serviceUserKey)
        )
      )
      .orderBy(rosteringRecommendedCallTimes.recommendedStartMinutes);
  }

  async deleteRosteringRecommendedCallTime(id: string): Promise<void> {
    await this.db.delete(rosteringRecommendedCallTimes).where(eq(rosteringRecommendedCallTimes.id, id));
  }

  async deleteRosteringRecommendedCallTimesByWorkbook(workbookId: string): Promise<number> {
    const deleted = await this.db
      .delete(rosteringRecommendedCallTimes)
      .where(eq(rosteringRecommendedCallTimes.workbookId, workbookId))
      .returning({ id: rosteringRecommendedCallTimes.id });
    return deleted.length;
  }

  // =========================================================================
  // Rostering Worker Start Times
  // =========================================================================

  async upsertRosteringWorkerStartTime(startTime: InsertRosteringWorkerStartTime): Promise<RosteringWorkerStartTime> {
    const inserted = await this.db
      .insert(rosteringWorkerStartTimes)
      .values(startTime)
      .onConflictDoUpdate({
        target: [
          rosteringWorkerStartTimes.workbookId,
          rosteringWorkerStartTimes.workerKey,
          rosteringWorkerStartTimes.templateWeek,
          rosteringWorkerStartTimes.templateDay,
        ],
        set: {
          recommendedStartMinutes: startTime.recommendedStartMinutes,
          recommendedEndMinutes: startTime.recommendedEndMinutes,
          maxCallsPerDay: startTime.maxCallsPerDay,
          maxMinutesPerDay: startTime.maxMinutesPerDay,
          notes: startTime.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted[0];
  }

  async getRosteringWorkerStartTimes(workbookId: string): Promise<RosteringWorkerStartTime[]> {
    return await this.db
      .select()
      .from(rosteringWorkerStartTimes)
      .where(eq(rosteringWorkerStartTimes.workbookId, workbookId))
      .orderBy(rosteringWorkerStartTimes.workerName, rosteringWorkerStartTimes.templateDay);
  }

  async getRosteringWorkerStartTimesByWorker(workbookId: string, workerKey: string): Promise<RosteringWorkerStartTime[]> {
    return await this.db
      .select()
      .from(rosteringWorkerStartTimes)
      .where(
        and(
          eq(rosteringWorkerStartTimes.workbookId, workbookId),
          eq(rosteringWorkerStartTimes.workerKey, workerKey)
        )
      )
      .orderBy(rosteringWorkerStartTimes.templateWeek, rosteringWorkerStartTimes.templateDay);
  }

  async deleteRosteringWorkerStartTime(id: string): Promise<void> {
    await this.db.delete(rosteringWorkerStartTimes).where(eq(rosteringWorkerStartTimes.id, id));
  }

  async deleteRosteringWorkerStartTimesByWorkbook(workbookId: string): Promise<number> {
    const deleted = await this.db
      .delete(rosteringWorkerStartTimes)
      .where(eq(rosteringWorkerStartTimes.workbookId, workbookId))
      .returning({ id: rosteringWorkerStartTimes.id });
    return deleted.length;
  }

  // =========================================================================
  // Rostering Worker Templates (who visits whom)
  // =========================================================================

  async upsertRosteringWorkerTemplate(template: InsertRosteringWorkerTemplate): Promise<RosteringWorkerTemplate> {
    const inserted = await this.db
      .insert(rosteringWorkerTemplates)
      .values(template)
      .onConflictDoUpdate({
        target: [
          rosteringWorkerTemplates.workbookId,
          rosteringWorkerTemplates.workerKey,
          rosteringWorkerTemplates.serviceUserKey,
          rosteringWorkerTemplates.templateWeek,
          rosteringWorkerTemplates.templateDay,
        ],
        set: {
          callTypeLabels: template.callTypeLabels,
          isPrimary: template.isPrimary,
          priority: template.priority,
          notes: template.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted[0];
  }

  async getRosteringWorkerTemplates(workbookId: string): Promise<RosteringWorkerTemplate[]> {
    return await this.db
      .select()
      .from(rosteringWorkerTemplates)
      .where(eq(rosteringWorkerTemplates.workbookId, workbookId))
      .orderBy(rosteringWorkerTemplates.workerName, rosteringWorkerTemplates.serviceUserName);
  }

  async getRosteringWorkerTemplatesByWorker(workbookId: string, workerKey: string): Promise<RosteringWorkerTemplate[]> {
    return await this.db
      .select()
      .from(rosteringWorkerTemplates)
      .where(
        and(
          eq(rosteringWorkerTemplates.workbookId, workbookId),
          eq(rosteringWorkerTemplates.workerKey, workerKey)
        )
      )
      .orderBy(rosteringWorkerTemplates.serviceUserName);
  }

  async getRosteringWorkerTemplatesByServiceUser(workbookId: string, serviceUserKey: string): Promise<RosteringWorkerTemplate[]> {
    return await this.db
      .select()
      .from(rosteringWorkerTemplates)
      .where(
        and(
          eq(rosteringWorkerTemplates.workbookId, workbookId),
          eq(rosteringWorkerTemplates.serviceUserKey, serviceUserKey)
        )
      )
      .orderBy(rosteringWorkerTemplates.priority, rosteringWorkerTemplates.workerName);
  }

  async deleteRosteringWorkerTemplate(id: string): Promise<void> {
    await this.db.delete(rosteringWorkerTemplates).where(eq(rosteringWorkerTemplates.id, id));
  }

  async deleteRosteringWorkerTemplatesByWorkbook(workbookId: string): Promise<number> {
    const deleted = await this.db
      .delete(rosteringWorkerTemplates)
      .where(eq(rosteringWorkerTemplates.workbookId, workbookId))
      .returning({ id: rosteringWorkerTemplates.id });
    return deleted.length;
  }

  // =========================================================================
  // Rostering Worker Constraints (max calls per worker)
  // =========================================================================

  async upsertRosteringWorkerConstraint(constraint: InsertRosteringWorkerConstraint): Promise<RosteringWorkerConstraint> {
    const inserted = await this.db
      .insert(rosteringWorkerConstraints)
      .values(constraint)
      .onConflictDoUpdate({
        target: [
          rosteringWorkerConstraints.workbookId,
          rosteringWorkerConstraints.workerKey,
        ],
        set: {
          maxCallsPerDay: constraint.maxCallsPerDay,
          maxMinutesPerDay: constraint.maxMinutesPerDay,
          maxCallsPerWeek: constraint.maxCallsPerWeek,
          maxMinutesPerWeek: constraint.maxMinutesPerWeek,
          preferredMaxDistance: constraint.preferredMaxDistance,
          availableDays: constraint.availableDays,
          unavailableDates: constraint.unavailableDates,
          notes: constraint.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted[0];
  }

  async getRosteringWorkerConstraints(workbookId: string): Promise<RosteringWorkerConstraint[]> {
    return await this.db
      .select()
      .from(rosteringWorkerConstraints)
      .where(eq(rosteringWorkerConstraints.workbookId, workbookId))
      .orderBy(rosteringWorkerConstraints.workerName);
  }

  async getRosteringWorkerConstraintByWorker(workbookId: string, workerKey: string): Promise<RosteringWorkerConstraint | undefined> {
    const result = await this.db
      .select()
      .from(rosteringWorkerConstraints)
      .where(
        and(
          eq(rosteringWorkerConstraints.workbookId, workbookId),
          eq(rosteringWorkerConstraints.workerKey, workerKey)
        )
      )
      .limit(1);
    return result[0];
  }

  async deleteRosteringWorkerConstraint(id: string): Promise<void> {
    await this.db.delete(rosteringWorkerConstraints).where(eq(rosteringWorkerConstraints.id, id));
  }

  async deleteRosteringWorkerConstraintsByWorkbook(workbookId: string): Promise<number> {
    const deleted = await this.db
      .delete(rosteringWorkerConstraints)
      .where(eq(rosteringWorkerConstraints.workbookId, workbookId))
      .returning({ id: rosteringWorkerConstraints.id });
    return deleted.length;
  }

  // Rostering Saved States implementation
  async createRosteringSavedState(state: InsertRosteringSavedState): Promise<RosteringSavedState> {
    const [result] = await this.db
      .insert(rosteringSavedStates)
      .values(state)
      .returning();
    return result;
  }

  async updateRosteringSavedState(id: string, updates: Partial<InsertRosteringSavedState>): Promise<RosteringSavedState | undefined> {
    const [result] = await this.db
      .update(rosteringSavedStates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rosteringSavedStates.id, id))
      .returning();
    return result;
  }

  async getRosteringSavedStates(workbookId: string): Promise<RosteringSavedState[]> {
    return await this.db
      .select()
      .from(rosteringSavedStates)
      .where(eq(rosteringSavedStates.workbookId, workbookId))
      .orderBy(desc(rosteringSavedStates.updatedAt));
  }

  async getRosteringSavedState(id: string): Promise<RosteringSavedState | undefined> {
    const [result] = await this.db
      .select()
      .from(rosteringSavedStates)
      .where(eq(rosteringSavedStates.id, id))
      .limit(1);
    return result;
  }

  async getActiveRosteringSavedState(workbookId: string, templateWeek: string, templateDay: string): Promise<RosteringSavedState | undefined> {
    const [result] = await this.db
      .select()
      .from(rosteringSavedStates)
      .where(
        and(
          eq(rosteringSavedStates.workbookId, workbookId),
          eq(rosteringSavedStates.templateWeek, templateWeek),
          eq(rosteringSavedStates.templateDay, templateDay),
          eq(rosteringSavedStates.isActive, true)
        )
      )
      .limit(1);
    return result;
  }

  async setActiveRosteringSavedState(id: string, workbookId: string): Promise<RosteringSavedState | undefined> {
    // First deactivate all other states for this workbook
    await this.db
      .update(rosteringSavedStates)
      .set({ isActive: false })
      .where(eq(rosteringSavedStates.workbookId, workbookId));

    // Now activate the selected state
    const [result] = await this.db
      .update(rosteringSavedStates)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(rosteringSavedStates.id, id))
      .returning();
    return result;
  }

  async deleteRosteringSavedState(id: string): Promise<void> {
    await this.db.delete(rosteringSavedStates).where(eq(rosteringSavedStates.id, id));
  }

  async deleteRosteringSavedStatesByWorkbook(workbookId: string): Promise<number> {
    const deleted = await this.db
      .delete(rosteringSavedStates)
      .where(eq(rosteringSavedStates.workbookId, workbookId))
      .returning({ id: rosteringSavedStates.id });
    return deleted.length;
  }

  // =========================================================================
  // EXTRACTED DATA IMPLEMENTATIONS
  // =========================================================================

  // Workbook Uploads
  async createWorkbookUpload(upload: InsertWorkbookUpload): Promise<WorkbookUpload> {
    const [result] = await this.db
      .insert(workbookUploads)
      .values(upload)
      .returning();
    return result;
  }

  async getWorkbookUpload(id: string): Promise<WorkbookUpload | undefined> {
    const [result] = await this.db
      .select()
      .from(workbookUploads)
      .where(eq(workbookUploads.id, id))
      .limit(1);
    return result;
  }

  async getWorkbookUploadByHash(fileHash: string): Promise<WorkbookUpload | undefined> {
    const [result] = await this.db
      .select()
      .from(workbookUploads)
      .where(eq(workbookUploads.fileHash, fileHash))
      .limit(1);
    return result;
  }

  async getAllWorkbookUploads(): Promise<WorkbookUpload[]> {
    return await this.db
      .select()
      .from(workbookUploads)
      .orderBy(desc(workbookUploads.createdAt));
  }

  async updateWorkbookUploadStatus(id: string, status: string, error?: string): Promise<WorkbookUpload | undefined> {
    const updates: any = { processingStatus: status };
    if (status === 'complete') {
      updates.completedAt = new Date();
    }
    if (error) {
      updates.processingError = error;
    }
    const [result] = await this.db
      .update(workbookUploads)
      .set(updates)
      .where(eq(workbookUploads.id, id))
      .returning();
    return result;
  }

  async deleteWorkbookUpload(id: string): Promise<void> {
    await this.db.delete(workbookUploads).where(eq(workbookUploads.id, id));
  }

  // Analyzed Service Users
  async upsertAnalyzedServiceUser(serviceUser: InsertAnalyzedServiceUser): Promise<AnalyzedServiceUser> {
    const [result] = await this.db
      .insert(analyzedServiceUsers)
      .values(serviceUser)
      .onConflictDoUpdate({
        target: analyzedServiceUsers.serviceUserKey,
        set: {
          serviceUserName: serviceUser.serviceUserName,
          serviceUserArea: serviceUser.serviceUserArea,
          serviceUserAddress: serviceUser.serviceUserAddress,
          serviceLocationBranch: serviceUser.serviceLocationBranch,
          serviceLocationType: serviceUser.serviceLocationType,
          latitude: serviceUser.latitude,
          longitude: serviceUser.longitude,
          totalCallsAnalyzed: serviceUser.totalCallsAnalyzed,
          earliestDataDate: serviceUser.earliestDataDate,
          latestDataDate: serviceUser.latestDataDate,
          metadata: serviceUser.metadata,
          updatedAt: new Date(),
          expiresAt: serviceUser.expiresAt,
        },
      })
      .returning();
    return result;
  }

  async getAnalyzedServiceUser(serviceUserKey: string): Promise<AnalyzedServiceUser | undefined> {
    const [result] = await this.db
      .select()
      .from(analyzedServiceUsers)
      .where(eq(analyzedServiceUsers.serviceUserKey, serviceUserKey))
      .limit(1);
    return result;
  }

  async getAllAnalyzedServiceUsers(): Promise<AnalyzedServiceUser[]> {
    return await this.db
      .select()
      .from(analyzedServiceUsers)
      .orderBy(analyzedServiceUsers.serviceUserName);
  }

  async deleteAnalyzedServiceUser(id: string): Promise<void> {
    await this.db.delete(analyzedServiceUsers).where(eq(analyzedServiceUsers.id, id));
  }

  async cleanupExpiredServiceUsers(): Promise<number> {
    const deleted = await this.db
      .delete(analyzedServiceUsers)
      .where(lte(analyzedServiceUsers.expiresAt, new Date()))
      .returning({ id: analyzedServiceUsers.id });
    return deleted.length;
  }

  // Analyzed Care Workers
  async upsertAnalyzedCareWorker(careWorker: InsertAnalyzedCareWorker): Promise<AnalyzedCareWorker> {
    const [result] = await this.db
      .insert(analyzedCareWorkers)
      .values(careWorker)
      .onConflictDoUpdate({
        target: analyzedCareWorkers.workerKey,
        set: {
          workerName: careWorker.workerName,
          workerNameNormalized: careWorker.workerNameNormalized,
          isAdminStaff: careWorker.isAdminStaff,
          totalCallsAnalyzed: careWorker.totalCallsAnalyzed,
          uniqueServiceUsers: careWorker.uniqueServiceUsers,
          avgCallsPerDay: careWorker.avgCallsPerDay,
          avgMinutesPerDay: careWorker.avgMinutesPerDay,
          earliestDataDate: careWorker.earliestDataDate,
          latestDataDate: careWorker.latestDataDate,
          metadata: careWorker.metadata,
          updatedAt: new Date(),
          expiresAt: careWorker.expiresAt,
        },
      })
      .returning();
    return result;
  }

  async getAnalyzedCareWorker(workerKey: string): Promise<AnalyzedCareWorker | undefined> {
    const [result] = await this.db
      .select()
      .from(analyzedCareWorkers)
      .where(eq(analyzedCareWorkers.workerKey, workerKey))
      .limit(1);
    return result;
  }

  async getAllAnalyzedCareWorkers(): Promise<AnalyzedCareWorker[]> {
    return await this.db
      .select()
      .from(analyzedCareWorkers)
      .orderBy(analyzedCareWorkers.workerName);
  }

  async deleteAnalyzedCareWorker(id: string): Promise<void> {
    await this.db.delete(analyzedCareWorkers).where(eq(analyzedCareWorkers.id, id));
  }

  async cleanupExpiredCareWorkers(): Promise<number> {
    const deleted = await this.db
      .delete(analyzedCareWorkers)
      .where(lte(analyzedCareWorkers.expiresAt, new Date()))
      .returning({ id: analyzedCareWorkers.id });
    return deleted.length;
  }

  // Service Orders
  async upsertServiceOrder(order: InsertServiceOrder): Promise<ServiceOrder> {
    const [result] = await this.db
      .insert(serviceOrders)
      .values(order)
      .onConflictDoUpdate({
        target: [serviceOrders.serviceUserKey, serviceOrders.callTypeKey, serviceOrders.timeBand],
        set: {
          serviceUserName: order.serviceUserName,
          callTypeLabel: order.callTypeLabel,
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
          metadata: order.metadata,
          updatedAt: new Date(),
          expiresAt: order.expiresAt,
        },
      })
      .returning();
    return result;
  }

  async getServiceOrdersByServiceUser(serviceUserKey: string): Promise<ServiceOrder[]> {
    return await this.db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.serviceUserKey, serviceUserKey))
      .orderBy(serviceOrders.timeBand, serviceOrders.callTypeLabel);
  }

  async getAllServiceOrders(): Promise<ServiceOrder[]> {
    return await this.db
      .select()
      .from(serviceOrders)
      .orderBy(serviceOrders.serviceUserName, serviceOrders.timeBand);
  }

  async deleteServiceOrder(id: string): Promise<void> {
    await this.db.delete(serviceOrders).where(eq(serviceOrders.id, id));
  }

  async cleanupExpiredServiceOrders(): Promise<number> {
    const deleted = await this.db
      .delete(serviceOrders)
      .where(lte(serviceOrders.expiresAt, new Date()))
      .returning({ id: serviceOrders.id });
    return deleted.length;
  }

  // Template Assignments
  async upsertTemplateAssignment(assignment: InsertTemplateAssignment): Promise<TemplateAssignment> {
    const [result] = await this.db
      .insert(templateAssignments)
      .values(assignment)
      .onConflictDoUpdate({
        target: [
          templateAssignments.workerKey,
          templateAssignments.serviceUserKey,
          templateAssignments.callTypeLabel,
          templateAssignments.templateWeek,
          templateAssignments.templateDay,
        ],
        set: {
          workerName: assignment.workerName,
          serviceUserName: assignment.serviceUserName,
          timeBand: assignment.timeBand,
          isTemplated: assignment.isTemplated,
          isPrimary: assignment.isPrimary,
          serviceRequirementStartMinutes: assignment.serviceRequirementStartMinutes,
          sourceDateKey: assignment.sourceDateKey,
          sourceRowHash: assignment.sourceRowHash,
          metadata: assignment.metadata,
          updatedAt: new Date(),
          expiresAt: assignment.expiresAt,
        },
      })
      .returning();
    return result;
  }

  async getTemplateAssignmentsByWorker(workerKey: string): Promise<TemplateAssignment[]> {
    return await this.db
      .select()
      .from(templateAssignments)
      .where(eq(templateAssignments.workerKey, workerKey))
      .orderBy(templateAssignments.templateWeek, templateAssignments.templateDay, templateAssignments.serviceUserName);
  }

  async getTemplateAssignmentsByServiceUser(serviceUserKey: string): Promise<TemplateAssignment[]> {
    return await this.db
      .select()
      .from(templateAssignments)
      .where(eq(templateAssignments.serviceUserKey, serviceUserKey))
      .orderBy(templateAssignments.templateWeek, templateAssignments.templateDay);
  }

  async getTemplateAssignmentsForDay(templateWeek: string, templateDay: string): Promise<TemplateAssignment[]> {
    return await this.db
      .select()
      .from(templateAssignments)
      .where(
        and(
          eq(templateAssignments.templateWeek, templateWeek),
          eq(templateAssignments.templateDay, templateDay)
        )
      )
      .orderBy(templateAssignments.workerName, templateAssignments.serviceUserName);
  }

  async getAllTemplateAssignments(): Promise<TemplateAssignment[]> {
    return await this.db
      .select()
      .from(templateAssignments)
      .orderBy(templateAssignments.workerName, templateAssignments.templateWeek, templateAssignments.templateDay);
  }

  async deleteTemplateAssignmentsForSlot(
    serviceUserKey: string,
    callTypeLabel: string,
    templateWeek: string,
    templateDay: string
  ): Promise<number> {
    const deleted = await this.db
      .delete(templateAssignments)
      .where(
        and(
          eq(templateAssignments.serviceUserKey, serviceUserKey),
          eq(templateAssignments.callTypeLabel, callTypeLabel),
          eq(templateAssignments.templateWeek, templateWeek),
          eq(templateAssignments.templateDay, templateDay)
        )
      )
      .returning({ id: templateAssignments.id });
    return deleted.length;
  }

  async deleteTemplateAssignment(id: string): Promise<void> {
    await this.db.delete(templateAssignments).where(eq(templateAssignments.id, id));
  }

  async cleanupExpiredTemplateAssignments(): Promise<number> {
    const deleted = await this.db
      .delete(templateAssignments)
      .where(lte(templateAssignments.expiresAt, new Date()))
      .returning({ id: templateAssignments.id });
    return deleted.length;
  }

  // Analyzed Calls
  async bulkInsertAnalyzedCalls(calls: InsertAnalyzedCall[]): Promise<number> {
    if (calls.length === 0) return 0;
    
    // Insert in batches to avoid overwhelming the DB
    const batchSize = 500;
    let inserted = 0;
    
    for (let i = 0; i < calls.length; i += batchSize) {
      const batch = calls.slice(i, i + batchSize);
      const result = await this.db
        .insert(analyzedCalls)
        .values(batch)
        .onConflictDoNothing({ target: analyzedCalls.callHash })
        .returning({ id: analyzedCalls.id });
      inserted += result.length;
    }
    
    return inserted;
  }

  async getAllAnalyzedCalls(): Promise<AnalyzedCall[]> {
    return await this.db
      .select()
      .from(analyzedCalls)
      .orderBy(desc(analyzedCalls.callDate));
  }

  async getAnalyzedCallsByServiceUser(serviceUserKey: string): Promise<AnalyzedCall[]> {
    return await this.db
      .select()
      .from(analyzedCalls)
      .where(eq(analyzedCalls.serviceUserKey, serviceUserKey))
      .orderBy(desc(analyzedCalls.callDate));
  }

  async getAnalyzedCallsByWorker(workerKey: string): Promise<AnalyzedCall[]> {
    return await this.db
      .select()
      .from(analyzedCalls)
      .where(eq(analyzedCalls.workerKey, workerKey))
      .orderBy(desc(analyzedCalls.callDate));
  }

  async getAnalyzedCallsByDateRange(startDate: string, endDate: string): Promise<AnalyzedCall[]> {
    return await this.db
      .select()
      .from(analyzedCalls)
      .where(
        and(
          sql`${analyzedCalls.callDate} >= ${startDate}`,
          sql`${analyzedCalls.callDate} <= ${endDate}`
        )
      )
      .orderBy(analyzedCalls.callDate, analyzedCalls.serviceUserName);
  }

  async deleteAnalyzedCall(id: string): Promise<void> {
    await this.db.delete(analyzedCalls).where(eq(analyzedCalls.id, id));
  }

  async cleanupExpiredCalls(): Promise<number> {
    const deleted = await this.db
      .delete(analyzedCalls)
      .where(lte(analyzedCalls.expiresAt, new Date()))
      .returning({ id: analyzedCalls.id });
    return deleted.length;
  }

  // Call Recommendations
  async upsertCallRecommendation(recommendation: InsertCallRecommendation): Promise<CallRecommendation> {
    const [result] = await this.db
      .insert(callRecommendations)
      .values(recommendation)
      .returning();
    return result;
  }

  async getCallRecommendationsByServiceUser(serviceUserKey: string): Promise<CallRecommendation[]> {
    return await this.db
      .select()
      .from(callRecommendations)
      .where(eq(callRecommendations.serviceUserKey, serviceUserKey))
      .orderBy(desc(callRecommendations.priority), callRecommendations.callTypeLabel);
  }

  async getPendingCallRecommendations(): Promise<CallRecommendation[]> {
    return await this.db
      .select()
      .from(callRecommendations)
      .where(eq(callRecommendations.isApplied, false))
      .orderBy(desc(callRecommendations.priority), desc(callRecommendations.confidence));
  }

  async applyCallRecommendation(id: string, appliedBy: string): Promise<CallRecommendation | undefined> {
    const [result] = await this.db
      .update(callRecommendations)
      .set({
        isApplied: true,
        appliedBy,
        appliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(callRecommendations.id, id))
      .returning();
    return result;
  }

  async deleteCallRecommendation(id: string): Promise<void> {
    await this.db.delete(callRecommendations).where(eq(callRecommendations.id, id));
  }

  async cleanupExpiredRecommendations(): Promise<number> {
    const deleted = await this.db
      .delete(callRecommendations)
      .where(lte(callRecommendations.expiresAt, new Date()))
      .returning({ id: callRecommendations.id });
    return deleted.length;
  }

  // Bulk cleanup of all expired data
  async cleanupAllExpiredData(): Promise<{
    serviceUsers: number;
    careWorkers: number;
    calls: number;
    orders: number;
    templates: number;
    recommendations: number;
  }> {
    const [serviceUsers, careWorkers, calls, orders, templates, recommendations] = await Promise.all([
      this.cleanupExpiredServiceUsers(),
      this.cleanupExpiredCareWorkers(),
      this.cleanupExpiredCalls(),
      this.cleanupExpiredServiceOrders(),
      this.cleanupExpiredTemplateAssignments(),
      this.cleanupExpiredRecommendations(),
    ]);

    return {
      serviceUsers,
      careWorkers,
      calls,
      orders,
      templates,
      recommendations,
    };
  }

  async resetRosteringData(): Promise<{
    careWorkerRotas: number;
    recommendedCallTimes: number;
    workerStartTimes: number;
    workerTemplates: number;
    workerConstraints: number;
    savedStates: number;
    analyzedServiceUsers: number;
    analyzedCareWorkers: number;
    analyzedCalls: number;
    serviceOrders: number;
    templateAssignments: number;
    callRecommendations: number;
    workbookUploads: number;
  }> {
    const [
      careWorkerRotasDeleted,
      recommendedCallTimesDeleted,
      workerStartTimesDeleted,
      workerTemplatesDeleted,
      workerConstraintsDeleted,
      savedStatesDeleted,
      analyzedServiceUsersDeleted,
      analyzedCareWorkersDeleted,
      analyzedCallsDeleted,
      serviceOrdersDeleted,
      templateAssignmentsDeleted,
      callRecommendationsDeleted,
      workbookUploadsDeleted,
    ] = await Promise.all([
      this.db.delete(careWorkerRotas).returning({ id: careWorkerRotas.id }).then((r) => r.length),
      this.db.delete(rosteringRecommendedCallTimes).returning({ id: rosteringRecommendedCallTimes.id }).then((r) => r.length),
      this.db.delete(rosteringWorkerStartTimes).returning({ id: rosteringWorkerStartTimes.id }).then((r) => r.length),
      this.db.delete(rosteringWorkerTemplates).returning({ id: rosteringWorkerTemplates.id }).then((r) => r.length),
      this.db.delete(rosteringWorkerConstraints).returning({ id: rosteringWorkerConstraints.id }).then((r) => r.length),
      this.db.delete(rosteringSavedStates).returning({ id: rosteringSavedStates.id }).then((r) => r.length),
      this.db.delete(analyzedServiceUsers).returning({ id: analyzedServiceUsers.id }).then((r) => r.length),
      this.db.delete(analyzedCareWorkers).returning({ id: analyzedCareWorkers.id }).then((r) => r.length),
      this.db.delete(analyzedCalls).returning({ id: analyzedCalls.id }).then((r) => r.length),
      this.db.delete(serviceOrders).returning({ id: serviceOrders.id }).then((r) => r.length),
      this.db.delete(templateAssignments).returning({ id: templateAssignments.id }).then((r) => r.length),
      this.db.delete(callRecommendations).returning({ id: callRecommendations.id }).then((r) => r.length),
      this.db.delete(workbookUploads).returning({ id: workbookUploads.id }).then((r) => r.length),
    ]);

    return {
      careWorkerRotas: careWorkerRotasDeleted,
      recommendedCallTimes: recommendedCallTimesDeleted,
      workerStartTimes: workerStartTimesDeleted,
      workerTemplates: workerTemplatesDeleted,
      workerConstraints: workerConstraintsDeleted,
      savedStates: savedStatesDeleted,
      analyzedServiceUsers: analyzedServiceUsersDeleted,
      analyzedCareWorkers: analyzedCareWorkersDeleted,
      analyzedCalls: analyzedCallsDeleted,
      serviceOrders: serviceOrdersDeleted,
      templateAssignments: templateAssignmentsDeleted,
      callRecommendations: callRecommendationsDeleted,
      workbookUploads: workbookUploadsDeleted,
    };
  }
}

export const storage = new DatabaseStorage();
