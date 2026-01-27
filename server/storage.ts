import { eq, and, desc, sql, inArray } from "drizzle-orm";
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
}

export const storage = new DatabaseStorage();
