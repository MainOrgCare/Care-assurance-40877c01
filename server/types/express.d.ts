import "express";

// Keep this minimal: we only need to teach TypeScript that we attach `user` onto req.
// The runtime assignment happens in middleware in `server/routes.ts`.

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        firstName?: string | null;
        lastName?: string | null;
        role: string;
        status?: string | null;
        jobTitle?: string | null;
        termsAcceptedAt?: string | null;
        termsVersion?: string | null;
        termsSignatureName?: string | null;
        termsSignatureDate?: string | null;
        isDemo?: boolean;
      };
    }
  }
}

export {};
