import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const normalize = (value: string | null | undefined): string =>
  String(value || "").trim().toLowerCase();

const isFalseValue = (value: string | null | undefined): boolean =>
  FALSE_VALUES.has(normalize(value));

const rawDatabaseUrl = process.env.DATABASE_URL;
const parsedUrl = new URL(rawDatabaseUrl);
const sslMode = normalize(parsedUrl.searchParams.get("sslmode"));

if (!sslMode) {
  parsedUrl.searchParams.set("sslmode", "require");
}

// Use libpq-compatible semantics to avoid strict verify-full aliasing warnings for sslmode=require.
if (normalize(parsedUrl.searchParams.get("sslmode")) === "require" && !parsedUrl.searchParams.has("uselibpqcompat")) {
  parsedUrl.searchParams.set("uselibpqcompat", "true");
}

const dbUrl = parsedUrl.toString();
const host = normalize(parsedUrl.hostname);
const looksLikeRenderPostgresHost = host.startsWith("dpg-") || host.endsWith(".onrender.com");
const runningOnRender = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_HOSTNAME || looksLikeRenderPostgresHost);
const rejectUnauthorized = process.env.PGSSLREJECTUNAUTHORIZED == null
  ? !runningOnRender
  : !isFalseValue(process.env.PGSSLREJECTUNAUTHORIZED);

const sslConfig = normalize(parsedUrl.searchParams.get("sslmode")) === "disable"
  ? undefined
  : { rejectUnauthorized };

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ssl: sslConfig,
  },
});
