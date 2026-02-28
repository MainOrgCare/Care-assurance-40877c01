import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { complianceSchema, COMPLIANCE_SYSTEM_PROMPT } from "../services/emarComplianceAgent.ts";

const workspaceRoot = process.cwd();

const loadJson = (relativePath: string) => {
  const filePath = path.join(workspaceRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const loadText = (relativePath: string) => {
  const filePath = path.join(workspaceRoot, relativePath);
  return fs.readFileSync(filePath, "utf8");
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

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

test("EMAR compliance runtime schema matches strict schema artifact", () => {
  const artifactSchema = loadJson("EMAR Structured Output.schema.json");
  const { $schema: _jsonSchemaVersion, title: _title, ...artifactComparable } = artifactSchema;

  assert.deepStrictEqual(complianceSchema.schema, artifactComparable);
  assert.equal(complianceSchema.strict, true);
  assert.equal(complianceSchema.name, "EMARComplianceAudit");
});

test("EMAR compliance prompt/preset rules include required strict directives", () => {
  const promptMarkdown = loadText("EMAR Strict JSON Test.prompt.md");
  const presetJson = loadJson("EMAR Strict JSON Test.preset.json");

  const presetSystemPromptField = presetJson?.operation?.fields?.find(
    (field: any) => field?.key === "llm.prediction.systemPrompt",
  );

  assert.ok(presetSystemPromptField?.value, "Preset is missing llm.prediction.systemPrompt");

  const runtime = normalize(COMPLIANCE_SYSTEM_PROMPT);
  const promptDoc = normalize(promptMarkdown);
  const presetPrompt = normalize(String(presetSystemPromptField.value));

  const requiredConcepts = [
    "return valid json only",
    "r, sa, f, nh, mu",
    "nh always requires verification",
    "allcareworkers",
    "inferredfromsameslot=true",
    "careworker=null",
    "trendwarnings",
  ];

  for (const concept of requiredConcepts) {
    assert.ok(runtime.includes(concept), `Runtime prompt missing concept: ${concept}`);
    assert.ok(promptDoc.includes(concept), `Prompt markdown missing concept: ${concept}`);
    assert.ok(presetPrompt.includes(concept), `Preset prompt missing concept: ${concept}`);
  }
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
