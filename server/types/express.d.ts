import "express";

/**
 * Express Request augmentation.
 *
 * Adds the authenticated `user` object that is injected by the
 * `requireAuth` middleware in `server/routes.ts`.  The shape mirrors
 * the public subset of the `users` table (see `@shared/schema`).
 */

/** Public user fields attached to `req.user` after authentication. */
export interface AuthenticatedUser {
  id: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  role: "admin" | "staff";
  status?: "active" | "pending" | "suspended" | null;
  jobTitle?: string | null;
  email?: string | null;
  termsAcceptedAt?: string | Date | null;
  termsVersion?: string | null;
  termsSignatureName?: string | null;
  termsSignatureDate?: string | null;
  twoFactorEnabled?: boolean;
  /** True when the session was created via the demo login flow. */
  isDemo?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
