/**
 * Route Module Registry
 *
 * Central barrel export for all modular route files.  Each module exposes a
 * registration function that accepts the Express app and shared middleware
 * dependencies (auth guards, rate limiters, etc.).
 *
 * Usage inside `registerRoutes()`:
 * ```ts
 * import { registerHandoverRoutes, registerTrainingRoutes, ... } from "./routes/index";
 * registerHandoverRoutes(app, { requireAuth });
 * ```
 *
 * @module server/routes
 */

export { registerHandoverRoutes } from "./handovers";
export { registerTrainingRoutes } from "./training";
export { registerPolicyAcknowledgementRoutes } from "./policyAcknowledgements";
export { registerClientErrorRoutes } from "./clientErrors";
export { registerMessageRoutes } from "./messages";
export { registerGdprRoutes } from "./gdpr";
export { registerContactRoutes } from "./contact";
export { registerExtensionRoutes } from "./extension";
export { registerAiUsageRoutes } from "./aiUsage";
export { registerSystemLogRoutes } from "./systemLogs";
export { registerDashboardRoutes } from "./dashboard";
export { registerCareWorkerRoutes } from "./careWorkers";
export { registerPolicyDocumentRoutes } from "./policyDocuments";
export { registerAdminPortalRoutes } from "./adminPortal";
export { registerEmailAssistantRoutes } from "./emailAssistant";
