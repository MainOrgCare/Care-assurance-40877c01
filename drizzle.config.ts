import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Ensure SSL is enabled for the database connection
const dbUrl = process.env.DATABASE_URL.includes('sslmode=') 
  ? process.env.DATABASE_URL 
  : `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}sslmode=require`;

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
