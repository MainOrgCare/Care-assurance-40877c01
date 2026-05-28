export const USER_ROLES = ["admin", "staff", "pilot"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "staff";
export const PILOT_ROLE: UserRole = "pilot";
export const DEFAULT_AUTHENTICATED_PATH = "/dashboard" as const;

const PILOT_ALLOWED_APP_PATHS = ["/dashboard", "/settings"] as const;
const PILOT_ALLOWED_APP_PREFIXES = ["/rostering"] as const;

type PilotApiRule = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  match?: "exact" | "prefix";
};

const PILOT_ALLOWED_API_RULES: readonly PilotApiRule[] = [
  { path: "/api/dashboard", match: "prefix" },
  { method: "PATCH", path: "/api/auth/password" },
  { method: "GET", path: "/api/auth/2fa/status" },
  { method: "POST", path: "/api/auth/2fa/setup" },
  { method: "POST", path: "/api/auth/2fa/enable" },
  { method: "POST", path: "/api/auth/2fa/disable" },
  { method: "POST", path: "/api/auth/accept-terms" },
  { method: "GET", path: "/api/audits" },
  { method: "GET", path: "/api/discrepancies" },
  // Rostering (read-only for pilot): allow view data but block admin mutations.
  { method: "GET", path: "/api/admin/rostering", match: "prefix" },
  { method: "GET", path: "/api/admin/rostering-recommendations", match: "prefix" },
];

const normalizePath = (path: string): string => {
  const [cleanPath] = path.split("?");
  const trimmedPath = cleanPath.replace(/\/+$/, "");
  return trimmedPath || "/";
};

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === "string" && USER_ROLES.includes(value as UserRole);

export const isAdminRole = (role: string | null | undefined): role is "admin" => role === "admin";

export const isPilotRole = (role: string | null | undefined): role is "pilot" => role === PILOT_ROLE;

export const getUserRoleLabel = (role: string | null | undefined): string => {
  switch (role) {
    case "admin":
      return "Admin";
    case PILOT_ROLE:
      return "Pilot";
    case "staff":
    default:
      return "Staff";
  }
};

export const getAuthenticatedHomePath = (): typeof DEFAULT_AUTHENTICATED_PATH =>
  DEFAULT_AUTHENTICATED_PATH;

export const canAccessAppPath = (
  role: string | null | undefined,
  path: string,
): boolean => {
  if (!role) {
    return false;
  }

  if (!isPilotRole(role)) {
    return true;
  }

  const normalizedPath = normalizePath(path);
  if (
    PILOT_ALLOWED_APP_PREFIXES.some(
      (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  return PILOT_ALLOWED_APP_PATHS.includes(
    normalizedPath as (typeof PILOT_ALLOWED_APP_PATHS)[number],
  );
};

export const canAccessApiPath = (
  role: string | null | undefined,
  method: string,
  path: string,
): boolean => {
  if (!role) {
    return false;
  }

  if (!isPilotRole(role)) {
    return true;
  }

  const normalizedMethod = method.toUpperCase() as PilotApiRule["method"];
  const normalizedPath = normalizePath(path);

  return PILOT_ALLOWED_API_RULES.some((rule) => {
    if (rule.method && rule.method !== normalizedMethod) {
      return false;
    }

    if (rule.match === "prefix") {
      return normalizedPath === rule.path || normalizedPath.startsWith(`${rule.path}/`);
    }

    return normalizedPath === rule.path;
  });
};