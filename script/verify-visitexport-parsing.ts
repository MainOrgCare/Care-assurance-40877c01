import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const PLANNED_TIME_KEYWORDS = [
  "planned start date and time",
  "planned start time",
  "planned start",
  "planned time",
  "scheduled time",
  "plan time",
  "expected time",
  "appointment time",
];

const ACTUAL_TIME_KEYWORDS = [
  "actual start date and time",
  "actual start time",
  "actual time",
  "delivered time",
  "visit time",
  "call time",
  "arrival time",
  "check-in time",
];

const SERVICE_REQUIREMENT_TIME_KEYWORDS = [
  "service requirement start date and time",
  "service requirement start time",
  "service requirement time",
  "requirement start time",
];

const PLANNED_WORKER_KEYWORDS = [
  "planned employee",
  "planned worker",
  "scheduled worker",
  "scheduled employee",
  "assigned worker",
  "assigned employee",
  "planned carer",
  "assigned carer",
];

const ACTUAL_WORKER_KEYWORDS = [
  "actual employee",
  "actual worker",
  "actual carer",
  "delivered worker",
  "delivered employee",
  "attending worker",
  "attending employee",
  "visiting carer",
];

const GENERIC_WORKER_KEYWORDS = [
  "care worker",
  "carer",
  "staff",
  "worker",
  "caregiver",
  "employee name",
];

const SERVICE_USER_NAME_KEYWORDS = [
  "service user",
  "service user name",
  "customer name",
  "client",
  "client name",
  "client full name",
  "service location name",
  "service location",
  "resident",
  "person",
  "individual",
  "patient",
  "su name",
  "people we support",
  "participant",
  "customer",
];

const SERVICE_USER_AREA_KEYWORDS = [
  "area",
  "region",
  "zone",
  "patch",
  "team",
  "borough",
  "branch",
  "customer area",
];

const SERVICE_USER_ADDRESS_KEYWORDS = [
  "address",
  "street",
  "road",
  "postcode",
  "post code",
  "zip",
  "city",
  "town",
  "service location address",
  "customer address",
];

const SERVICE_REQUIREMENT_TYPE_KEYWORDS = [
  "service requirement type description",
  "service requirement description",
  "service type",
  "service requirement type",
];

const SERVICE_REQUIREMENT_SERVICE_TYPE_KEYWORDS = [
  "service requirement service type description",
  "service requirement service description",
];

type DetectedField = { key: string; value: any } | null;

function normalizeKeyForMatch(label: string) {
  return label.replace(/[_-]+/g, " ").trim().toLowerCase();
}

function detectField(row: Record<string, any>, keywords: string[], excludeKeys?: Set<string>): DetectedField {
  if (!keywords.length) return null;
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (const key of Object.keys(row)) {
    if (excludeKeys?.has(key)) continue;
    const normalizedKey = normalizeKeyForMatch(key);
    if (normalizedKeywords.some((keyword) => normalizedKey.includes(keyword))) {
      return { key, value: row[key] };
    }
  }
  return null;
}

function sanitizeStringValue(value: any): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function sanitizeHumanReadable(value: any): string | null {
  const text = sanitizeStringValue(value);
  if (!text) return null;
  return text.replace(/\s+/g, " ").trim();
}

function excelSerialToMinutes(value: number): number | null {
  const parser = (XLSX as any).SSF?.parse_date_code;
  if (typeof parser === "function") {
    const parts = parser(value);
    if (!parts) return null;
    const hours = (parts.H ?? parts.h ?? 0) as number;
    const minutes = (parts.M ?? parts.m ?? 0) as number;
    const seconds = (parts.S ?? parts.s ?? 0) as number;
    return hours * 60 + minutes + seconds / 60;
  }

  // Fallback: Excel serial date-time stores time as a fraction of a day.
  const fraction = value - Math.floor(value);
  if (fraction >= 0 && fraction < 1) {
    return fraction * 24 * 60;
  }

  return null;
}

function parseTimeToMinutes(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelMinutes = excelSerialToMinutes(value);
    if (excelMinutes !== null) return excelMinutes;
    if (value >= 0 && value < 1) {
      return value * 24 * 60;
    }
    if (value <= 24) {
      return value * 60;
    }
    if (value > 24 && value <= 24 * 60) {
      return value;
    }
  }
  const str = String(value).trim();
  if (!str) return null;

  const european = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (european) {
    return Number(european[4]) * 60 + Number(european[5]) + Number(european[6] ?? "0") / 60;
  }

  const dateValue = Date.parse(str);
  if (!Number.isNaN(dateValue)) {
    const date = new Date(dateValue);
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  }
  const timeMatch = str.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] ?? "0");
    const seconds = Number(timeMatch[3] ?? "0");
    const meridiem = timeMatch[4]?.toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes + seconds / 60;
  }
  return null;
}

function deriveTimeLabel(minutes: number | null, raw: any): string | null {
  if (minutes === null || Number.isNaN(minutes)) {
    return sanitizeStringValue(raw);
  }
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function main() {
  const csvPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), "attached_assets", "VisitExport.csv");

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const csvText = fs.readFileSync(csvPath, "utf8");
  const workbook = XLSX.read(csvText, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  let missingName = 0;
  let missingPlanned = 0;
  let missingActual = 0;
  let missingWorker = 0;
  let missingCallType = 0;

  const samples: any[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    const plannedTimeField = detectField(row, PLANNED_TIME_KEYWORDS);
    const serviceRequirementTimeField = detectField(
      row,
      SERVICE_REQUIREMENT_TIME_KEYWORDS,
      plannedTimeField ? new Set([plannedTimeField.key]) : undefined
    );
    const plannedTimeSource = plannedTimeField ?? serviceRequirementTimeField;

    const actualTimeField = detectField(
      row,
      ACTUAL_TIME_KEYWORDS,
      (() => {
        const exclude = new Set<string>();
        if (plannedTimeField) exclude.add(plannedTimeField.key);
        if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
        return exclude.size ? exclude : undefined;
      })()
    );

    let plannedWorkerField = detectField(row, PLANNED_WORKER_KEYWORDS);
    if (!plannedWorkerField) plannedWorkerField = detectField(row, GENERIC_WORKER_KEYWORDS);

    let actualWorkerField = detectField(
      row,
      ACTUAL_WORKER_KEYWORDS,
      plannedWorkerField ? new Set([plannedWorkerField.key]) : undefined
    );
    if (!actualWorkerField) {
      actualWorkerField = detectField(
        row,
        GENERIC_WORKER_KEYWORDS,
        plannedWorkerField ? new Set([plannedWorkerField.key]) : undefined
      );
    }

    const serviceUserNameField = detectField(row, SERVICE_USER_NAME_KEYWORDS);
    const serviceLocationNameField = detectField(
      row,
      ["service location name", "customer name"],
      serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
    );

    const serviceUserAreaField = detectField(
      row,
      SERVICE_USER_AREA_KEYWORDS,
      serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
    );

    const serviceUserAddressField = detectField(
      row,
      SERVICE_USER_ADDRESS_KEYWORDS,
      serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
    );

    const serviceLocationAddressField = detectField(
      row,
      ["service location address", "customer address"],
      serviceUserAddressField ? new Set([serviceUserAddressField.key]) : undefined
    );

    const serviceRequirementTypeField = detectField(row, SERVICE_REQUIREMENT_TYPE_KEYWORDS);
    const serviceRequirementServiceTypeField = detectField(
      row,
      SERVICE_REQUIREMENT_SERVICE_TYPE_KEYWORDS,
      serviceRequirementTypeField ? new Set([serviceRequirementTypeField.key]) : undefined
    );

    const serviceRequirementFallbackField = detectField(
      row,
      [
        "planned service requirement type description",
        "planned service type description",
        "actual service requirement type description",
        "actual service type description",
      ],
      (() => {
        const exclude = new Set<string>();
        if (serviceRequirementTypeField) exclude.add(serviceRequirementTypeField.key);
        if (serviceRequirementServiceTypeField) exclude.add(serviceRequirementServiceTypeField.key);
        return exclude.size ? exclude : undefined;
      })()
    );

    const callTypeParts = [
      serviceRequirementTypeField?.value,
      serviceRequirementServiceTypeField?.value,
      serviceRequirementFallbackField?.value,
    ]
      .map(sanitizeHumanReadable)
      .filter(Boolean) as string[];

    const callTypeLabel = callTypeParts.length
      ? Array.from(new Set(callTypeParts)).join(" • ")
      : null;

    const plannedMinutes = plannedTimeSource ? parseTimeToMinutes(plannedTimeSource.value) : null;
    const actualMinutes = actualTimeField ? parseTimeToMinutes(actualTimeField.value) : null;

    const serviceUserName = sanitizeHumanReadable(serviceLocationNameField?.value ?? serviceUserNameField?.value);
    const serviceUserArea = sanitizeHumanReadable(serviceUserAreaField?.value);
    const serviceUserAddress = sanitizeHumanReadable(serviceLocationAddressField?.value ?? serviceUserAddressField?.value);

    const plannedWorker = sanitizeHumanReadable(plannedWorkerField?.value);
    const actualWorker = sanitizeHumanReadable(actualWorkerField?.value);

    if (!serviceUserName) missingName += 1;
    if (plannedMinutes === null) missingPlanned += 1;
    if (actualMinutes === null) missingActual += 1;
    if (!plannedWorker && !actualWorker) missingWorker += 1;
    if (!callTypeLabel) missingCallType += 1;

    if (samples.length < 10) {
      samples.push({
        row: i + 1,
        serviceUserName,
        serviceUserArea,
        serviceUserAddress,
        plannedTime: deriveTimeLabel(plannedMinutes, plannedTimeSource?.value),
        actualTime: deriveTimeLabel(actualMinutes, actualTimeField?.value),
        plannedWorker,
        actualWorker,
        callTypeLabel,
      });
    }
  }

  console.log("Sample extracted rows:");
  console.log(JSON.stringify(samples, null, 2));
  console.log("\nMissing field counts:");
  console.log(
    JSON.stringify(
      {
        totalRows: rows.length,
        missingName,
        missingPlanned,
        missingActual,
        missingWorker,
        missingCallType,
      },
      null,
      2
    )
  );
}

main();
