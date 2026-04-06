/**
 * Centralised Query Key Factory
 *
 * All TanStack Query keys should be referenced through this factory so that
 * query/invalidation calls always use the same key structure.
 *
 * Convention:
 * - Top-level groups map to route domains (auth, dashboard, rostering …).
 * - Each leaf function returns a readonly tuple for type-safe comparisons.
 *
 * @module client/src/lib/queryKeys
 */
export const queryKeys = {
  auth: {
    me: () => ["/api/auth/me"] as const,
  },

  dashboard: {
    stats: () => ["/api/dashboard/stats"] as const,
    widgets: () => ["/api/dashboard/widgets"] as const,
    activity: () => ["/api/dashboard/activity"] as const,
  },

  audits: {
    all: () => ["/api/audits"] as const,
    careWorkers: () => ["/api/audits/care-workers"] as const,
  },

  users: {
    all: () => ["/api/users"] as const,
  },

  policies: {
    all: () => ["/api/policy-documents"] as const,
    acknowledgements: () => ["/api/policy-acknowledgements"] as const,
  },

  rostering: {
    dataStats: () => ["/api/admin/rostering/data-stats"] as const,
    workbookUploads: () => ["/api/admin/rostering/workbook-uploads"] as const,
    workbookDetail: (workbookId: string | number) =>
      ["/api/admin/rostering/workbook-uploads", workbookId] as const,
    callTimes: (workbookId: string | number) =>
      ["/api/admin/rostering/workbooks", workbookId, "call-times"] as const,
    workerConstraints: (workbookId: string | number) =>
      ["/api/admin/rostering/workbooks", workbookId, "worker-constraints"] as const,
    savedStates: (workbookId: string | number) =>
      ["/api/admin/rostering/workbooks", workbookId, "saved-states"] as const,
    scheduleTemplates: (workbookId: string | number) =>
      ["scheduleTemplates", workbookId] as const,
  },
} as const;
