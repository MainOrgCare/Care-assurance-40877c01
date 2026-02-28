import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadEmarComplianceArtifacts } from "../utils/emarComplianceArtifacts.ts";

const withTempWorkspace = async (fn: (workspaceDir: string) => void | Promise<void>) => {
  const previousCwd = process.cwd();
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "emar-artifacts-"));

  try {
    process.chdir(workspaceDir);
    await fn(workspaceDir);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
};

const withSuppressedWarnings = async (fn: () => void | Promise<void>) => {
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    await fn();
  } finally {
    console.warn = originalWarn;
  }
};

test("loadEmarComplianceArtifacts falls back when artifacts are missing", async () => {
  await withSuppressedWarnings(async () => {
    await withTempWorkspace(() => {
      const { schema, systemPrompt } = loadEmarComplianceArtifacts();

      assert.equal((schema as any).type, "object");
      assert.deepEqual((schema as any).required, ["records", "allCareWorkers", "trendWarnings", "summary"]);
      assert.match(systemPrompt, /Return valid JSON only\./);
    });
  });
});

test("loadEmarComplianceArtifacts loads schema and prompt from artifacts", async () => {
  await withTempWorkspace((workspaceDir) => {
    const schemaArtifact = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "EMARAuditResult",
      type: "object",
      additionalProperties: false,
      required: ["records", "allCareWorkers", "trendWarnings", "summary"],
      properties: {
        records: { type: "array" },
        allCareWorkers: { type: "array" },
        trendWarnings: { type: "array" },
        summary: { type: "object" },
      },
    };

    const presetArtifact = {
      operation: {
        fields: [
          { key: "llm.prediction.systemPrompt", value: "ARTIFACT_PROMPT" },
        ],
      },
    };

    fs.writeFileSync(
      path.join(workspaceDir, "EMAR Structured Output.schema.json"),
      JSON.stringify(schemaArtifact, null, 2),
      "utf8",
    );

    fs.writeFileSync(
      path.join(workspaceDir, "EMAR Strict JSON Test.preset.json"),
      JSON.stringify(presetArtifact, null, 2),
      "utf8",
    );

    const { schema, systemPrompt } = loadEmarComplianceArtifacts();

    assert.equal((schema as any).type, "object");
    assert.equal((schema as any).additionalProperties, false);
    assert.equal(systemPrompt, "ARTIFACT_PROMPT");
  });
});

test("loadEmarComplianceArtifacts falls back to default prompt when preset is invalid", async () => {
  await withSuppressedWarnings(async () => {
    await withTempWorkspace((workspaceDir) => {
      const schemaArtifact = {
        type: "object",
        additionalProperties: false,
        required: ["records", "allCareWorkers", "trendWarnings", "summary"],
        properties: {
          records: { type: "array" },
          allCareWorkers: { type: "array" },
          trendWarnings: { type: "array" },
          summary: { type: "object" },
        },
      };

      fs.writeFileSync(
        path.join(workspaceDir, "EMAR Structured Output.schema.json"),
        JSON.stringify(schemaArtifact, null, 2),
        "utf8",
      );

      fs.writeFileSync(
        path.join(workspaceDir, "EMAR Strict JSON Test.preset.json"),
        JSON.stringify({ operation: { fields: [] } }, null, 2),
        "utf8",
      );

      const { systemPrompt } = loadEmarComplianceArtifacts();
      assert.match(systemPrompt, /Return valid JSON only\./);
    });
  });
});
