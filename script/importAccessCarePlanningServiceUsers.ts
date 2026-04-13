import { promises as fs } from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pkg from "pg";
import * as XLSX from "xlsx";

import { accessCarePlanningServiceUsers } from "../shared/schema";
import { getPgPoolConfig } from "../server/utils/pgPoolConfig";

const { Pool } = pkg;

type WorksheetCell = XLSX.CellObject & {
  l?: { Target?: string };
  f?: string;
};

type ParsedRecord = {
  accessCarePlanningId: string;
  serviceUserName: string;
};

const DEFAULT_WORKBOOK_CANDIDATES = [
  "newcastle_service_users_CLEANED 2.xlsx",
  "newcastle_service_users_CLEANED.xlsx",
];

const HYPERLINK_FORMULA_REGEX = /HYPERLINK\("([^"]+)"/i;
const HEADER_NAME_REGEX = /^(name|service user|service user name)$/i;

function stripWrappingQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

async function ensureDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL?.trim()) {
    return stripWrappingQuotes(process.env.DATABASE_URL.trim());
  }

  const envPath = path.resolve(process.cwd(), ".env");
  const envRaw = await fs.readFile(envPath, "utf8");
  const line = envRaw
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("DATABASE_URL="));

  if (!line) {
    throw new Error("DATABASE_URL is not configured. Set it in the environment or .env before running the import.");
  }

  const [, rawValue = ""] = line.split(/=(.*)/s);
  const databaseUrl = stripWrappingQuotes(rawValue.trim());
  process.env.DATABASE_URL = databaseUrl;
  return databaseUrl;
}

function looksLikeUrl(value: string | null | undefined): boolean {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function normalizeName(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCellText(cell?: WorksheetCell): string {
  if (!cell) return "";
  const raw = cell.w ?? cell.v;
  return normalizeName(raw == null ? "" : String(raw));
}

function getCellLink(cell?: WorksheetCell): string {
  if (!cell) return "";

  const directTarget = normalizeName(cell.l?.Target);
  if (looksLikeUrl(directTarget)) return directTarget;

  const textValue = getCellText(cell);
  if (looksLikeUrl(textValue)) return textValue;

  const formula = normalizeName(cell.f);
  const formulaMatch = formula.match(HYPERLINK_FORMULA_REGEX);
  if (formulaMatch?.[1] && looksLikeUrl(formulaMatch[1])) {
    return formulaMatch[1];
  }

  return "";
}

function extractAccessCarePlanningId(url: string): string | null {
  const trimmed = normalizeName(url);
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const preferredParams = ["id", "caseId", "serviceUserId", "clientId", "recordId"];
    for (const key of preferredParams) {
      const value = parsed.searchParams.get(key);
      if (value && /^\d+$/.test(value)) return value;
    }

    const pathSegments = parsed.pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
    for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
      if (/^\d+$/.test(pathSegments[index])) {
        return pathSegments[index];
      }
    }
  } catch {
    // Fall through to generic number capture.
  }

  const fallbackMatch = trimmed.match(/\b(\d{3,})\b/);
  return fallbackMatch?.[1] ?? null;
}

function parseWorksheet(sheet: XLSX.WorkSheet): ParsedRecord[] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const records = new Map<string, ParsedRecord>();

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const cells: Array<{ column: number; text: string; link: string }> = [];

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[cellAddress] as WorksheetCell | undefined;
      if (!cell) continue;

      const text = getCellText(cell);
      const link = getCellLink(cell);
      if (!text && !link) continue;

      cells.push({ column: columnIndex, text, link });
    }

    if (cells.length < 2) continue;

    const linkCell = cells.find((cell) => Boolean(cell.link));
    if (!linkCell) continue;

    const nameCell = [...cells]
      .reverse()
      .find((cell) => cell.column < linkCell.column && cell.text && !looksLikeUrl(cell.text));

    if (!nameCell) continue;

    const serviceUserName = normalizeName(nameCell.text);
    if (!serviceUserName || HEADER_NAME_REGEX.test(serviceUserName)) continue;

    const accessCarePlanningId = extractAccessCarePlanningId(linkCell.link);
    if (!accessCarePlanningId) continue;

    records.set(accessCarePlanningId, {
      accessCarePlanningId,
      serviceUserName,
    });
  }

  return Array.from(records.values());
}

async function resolveWorkbookPath(rawArg?: string): Promise<string> {
  const candidates = rawArg ? [rawArg] : DEFAULT_WORKBOOK_CANDIDATES;

  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    `Workbook not found. Provide a path, e.g. \`npm run import:acp-service-users -- ./service-users.xlsx\`, or place one of these files in the repo root: ${DEFAULT_WORKBOOK_CANDIDATES.join(", ")}.`
  );
}

async function ensureTable(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS access_care_planning_service_users (
      access_care_planning_id text PRIMARY KEY,
      service_user_name text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS access_care_planning_service_users_name_idx
    ON access_care_planning_service_users (service_user_name)
  `);
}

async function main() {
  const workbookPath = await resolveWorkbookPath(process.argv[2]);
  const databaseUrl = await ensureDatabaseUrl();

  const workbook = XLSX.readFile(workbookPath, { cellFormula: true, cellHTML: false, cellNF: false });
  const records = workbook.SheetNames.flatMap((sheetName) => parseWorksheet(workbook.Sheets[sheetName]));
  const deduped = Array.from(new Map(records.map((record) => [record.accessCarePlanningId, record])).values())
    .sort((left, right) => left.serviceUserName.localeCompare(right.serviceUserName));

  if (!deduped.length) {
    throw new Error("No service user name/link pairs were found in the workbook.");
  }

  const pool = new Pool(getPgPoolConfig(databaseUrl));
  const db = drizzle(pool);

  try {
    await ensureTable(db);
    await db
      .insert(accessCarePlanningServiceUsers)
      .values(deduped)
      .onConflictDoUpdate({
        target: accessCarePlanningServiceUsers.accessCarePlanningId,
        set: {
          serviceUserName: sql`excluded.service_user_name`,
          updatedAt: new Date(),
        },
      });

    console.log(`Imported ${deduped.length} ACP service user records from ${path.basename(workbookPath)}.`);
    console.log(`Example: ${deduped[0].serviceUserName} -> ${deduped[0].accessCarePlanningId}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});