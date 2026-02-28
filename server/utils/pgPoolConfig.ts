const SSL_REQUIRED_MODES = new Set(["require", "verify-ca", "verify-full"]);
const SSL_DISABLED_MODES = new Set(["disable"]);
const SSL_PREFERRED_MODES = new Set(["allow", "prefer"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const normalize = (value: string | null | undefined): string =>
  String(value || "").trim().toLowerCase();

const isFalseValue = (value: string | null | undefined): boolean =>
  FALSE_VALUES.has(normalize(value));

const getSslModeFromConnectionString = (connectionString?: string): string => {
  if (!connectionString) return "";
  try {
    const url = new URL(connectionString);
    return normalize(url.searchParams.get("sslmode"));
  } catch {
    return "";
  }
};

const getHostFromConnectionString = (connectionString?: string): string => {
  if (!connectionString) return "";
  try {
    const url = new URL(connectionString);
    return normalize(url.hostname);
  } catch {
    return "";
  }
};

const isLocalHost = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "::1";

const isSslRequired = (connectionString?: string): boolean => {
  const host = getHostFromConnectionString(connectionString);
  const remoteHost = Boolean(host && !isLocalHost(host));

  const modeFromEnv = normalize(process.env.PGSSLMODE);
  if (modeFromEnv && SSL_REQUIRED_MODES.has(modeFromEnv)) {
    return true;
  }
  if (modeFromEnv && SSL_DISABLED_MODES.has(modeFromEnv)) {
    return false;
  }
  if (modeFromEnv && SSL_PREFERRED_MODES.has(modeFromEnv)) {
    return remoteHost;
  }

  const modeFromUrl = getSslModeFromConnectionString(connectionString);
  if (modeFromUrl && SSL_REQUIRED_MODES.has(modeFromUrl)) {
    return true;
  }
  if (modeFromUrl && SSL_DISABLED_MODES.has(modeFromUrl)) {
    return false;
  }
  if (modeFromUrl && SSL_PREFERRED_MODES.has(modeFromUrl)) {
    return remoteHost;
  }

  if (!host) return false;
  return !isLocalHost(host);
};

export const getPgPoolConfig = (connectionString?: string): {
  connectionString?: string;
  ssl?: { rejectUnauthorized: boolean };
} => {
  const config: {
    connectionString?: string;
    ssl?: { rejectUnauthorized: boolean };
  } = { connectionString };

  if (isSslRequired(connectionString)) {
    // Default to true (validate certificates) for security.
    // Set PGSSLREJECTUNAUTHORIZED=false explicitly to disable (e.g. for Render internal DB).
    const runningOnRender = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_HOSTNAME);
    const rejectUnauthorized = process.env.PGSSLREJECTUNAUTHORIZED == null
      ? !runningOnRender
      : !isFalseValue(process.env.PGSSLREJECTUNAUTHORIZED);
    config.ssl = { rejectUnauthorized };
  }

  return config;
};
