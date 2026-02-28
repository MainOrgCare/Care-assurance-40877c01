import test from "node:test";
import assert from "node:assert/strict";
import { COMPLIANCE_SYSTEM_PROMPT, complianceSchema } from "../services/emarComplianceAgent.ts";

const validateComplianceInvariants = (payload: any): string[] => {
  const errors: string[] = [];

  const records = Array.isArray(payload?.records) ? payload.records : [];
  const summary = payload?.summary;
  const byCode = summary?.byCode ?? {};

  for (const record of records) {
    if (record?.code === "NH" && record?.requiresVerification !== true) {
      errors.push("NH record must set requiresVerification=true");
    }
  }

  const codeCounts = records.reduce(
    (acc: Record<string, number>, record: any) => {
      const code = record?.code;
      if (typeof code === "string" && Object.prototype.hasOwnProperty.call(acc, code)) {
        acc[code] += 1;
      }
      return acc;
    },
    { R: 0, SA: 0, F: 0, NH: 0, MU: 0 },
  );

  for (const code of ["R", "SA", "F", "NH", "MU"] as const) {
    const summaryCount = byCode?.[code];
    if (typeof summaryCount === "number" && summaryCount !== codeCounts[code]) {
      errors.push(`summary.byCode.${code} (${summaryCount}) does not match records (${codeCounts[code]})`);
    }
  }

  if (typeof summary?.totalRecords === "number" && summary.totalRecords !== records.length) {
    errors.push(`summary.totalRecords (${summary.totalRecords}) does not match records length (${records.length})`);
  }

  return errors;
};

test("EMAR compliance exports remain available for optional strict mode", () => {
  assert.equal(complianceSchema.name, "EMARComplianceAudit");
  assert.equal(complianceSchema.strict, true);
  assert.equal(typeof COMPLIANCE_SYSTEM_PROMPT, "string");
  assert.ok(COMPLIANCE_SYSTEM_PROMPT.length > 0);
});

test("EMAR compliance invariants catch NH and summary mismatches", () => {
  const validPayload = {
    records: [
      {
        date: "2026-02-01",
        timeSlot: "08:00-09:00",
        medicine: "Paracetamol",
        code: "NH",
        careWorker: "AB",
        requiresVerification: true,
        inferredFromSameSlot: false,
        notes: null,
      },
      {
        date: "2026-02-01",
        timeSlot: "09:00-10:00",
        medicine: "Ibuprofen",
        code: "R",
        careWorker: "AB",
        requiresVerification: false,
        inferredFromSameSlot: false,
        notes: null,
      },
    ],
    allCareWorkers: ["AB"],
    trendWarnings: ["Repeated R events"],
    summary: {
      totalRecords: 2,
      byCode: { R: 1, SA: 0, F: 0, NH: 1, MU: 0 },
    },
  };

  assert.deepStrictEqual(validateComplianceInvariants(validPayload), []);

  const invalidPayload = {
    ...validPayload,
    records: [
      {
        ...validPayload.records[0],
        requiresVerification: false,
      },
      ...validPayload.records.slice(1),
    ],
    summary: {
      totalRecords: 99,
      byCode: { R: 9, SA: 0, F: 0, NH: 1, MU: 0 },
    },
  };

  const errors = validateComplianceInvariants(invalidPayload);
  assert.ok(errors.some((error) => error.includes("requiresVerification=true")));
  assert.ok(errors.some((error) => error.includes("summary.byCode.R")));
  assert.ok(errors.some((error) => error.includes("summary.totalRecords")));
});
