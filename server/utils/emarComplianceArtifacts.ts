import fs from "node:fs";
import path from "node:path";

const getArtifactPaths = () => ({
  schemaArtifactPath: path.resolve(process.cwd(), "EMAR Structured Output.schema.json"),
  presetArtifactPath: path.resolve(process.cwd(), "EMAR Strict JSON Test.preset.json"),
});

const warn = (message: string, error?: unknown) => {
  if (error) {
    console.warn(`[EMAR Compliance Artifacts] ${message}`, error);
    return;
  }
  console.warn(`[EMAR Compliance Artifacts] ${message}`);
};

const fallbackSchema = {
  type: "object",
  additionalProperties: false,
  required: ["records", "allCareWorkers", "trendWarnings", "summary"],
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "timeSlot", "medicine", "code", "careWorker", "requiresVerification", "inferredFromSameSlot", "notes"],
        properties: {
          date: { type: ["string", "null"], description: "ISO date YYYY-MM-DD when available" },
          timeSlot: { type: ["string", "null"] },
          medicine: { type: ["string", "null"] },
          code: { type: ["string", "null"], enum: ["R", "SA", "F", "NH", "MU", null] },
          careWorker: { type: ["string", "null"] },
          requiresVerification: { type: "boolean", description: "Must be true for NH" },
          inferredFromSameSlot: { type: "boolean" },
          notes: { type: ["string", "null"] }
        }
      }
    },
    allCareWorkers: {
      type: "array",
      items: { type: "string" },
      uniqueItems: true
    },
    trendWarnings: {
      type: "array",
      items: { type: "string" }
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["totalRecords", "byCode"],
      properties: {
        totalRecords: { type: "integer", minimum: 0 },
        byCode: {
          type: "object",
          additionalProperties: false,
          required: ["R", "SA", "F", "NH", "MU"],
          properties: {
            R: { type: "integer", minimum: 0 },
            SA: { type: "integer", minimum: 0 },
            F: { type: "integer", minimum: 0 },
            NH: { type: "integer", minimum: 0 },
            MU: { type: "integer", minimum: 0 }
          }
        }
      }
    }
  }
};

const fallbackSystemPrompt = `TASK
Extract medication administration events from the provided eMAR content.

RULES
- Return valid JSON only.
- Must match the provided structured output schema exactly.
- No markdown, no prose, no extra keys.
- Allowed non-administration codes: R, SA, F, NH, MU.
- NH always requires verification.
- Include all detected care worker names in allCareWorkers.
- If care worker is unknown, infer from records in the same date + timeSlot when possible and set inferredFromSameSlot=true.
- If unknown after inference, set careWorker=null and inferredFromSameSlot=false.
- Use YYYY-MM-DD dates when possible; otherwise null.
- Add trendWarnings when repeated R/SA/F/NH/MU patterns appear.`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function loadSchemaArtifact(): Record<string, unknown> {
  const { schemaArtifactPath } = getArtifactPaths();

  try {
    const raw = fs.readFileSync(schemaArtifactPath, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      warn(`Schema artifact is not a JSON object: ${schemaArtifactPath}. Using fallback schema.`);
      return fallbackSchema;
    }

    const { $schema: _jsonSchemaVersion, title: _title, ...comparableSchema } = parsed;
    if (!isRecord(comparableSchema)) {
      warn(`Schema artifact content is invalid: ${schemaArtifactPath}. Using fallback schema.`);
      return fallbackSchema;
    }

    return comparableSchema;
  } catch (error) {
    warn(`Failed to read or parse schema artifact at ${schemaArtifactPath}. Using fallback schema.`, error);
    return fallbackSchema;
  }
}

function loadPromptFromPreset(): string {
  const { presetArtifactPath } = getArtifactPaths();

  try {
    const raw = fs.readFileSync(presetArtifactPath, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      warn(`Preset artifact is not a JSON object: ${presetArtifactPath}. Using fallback prompt.`);
      return fallbackSystemPrompt;
    }

    const operation = parsed.operation;
    const fields = isRecord(operation) ? operation.fields : undefined;

    if (!Array.isArray(fields)) {
      warn(`Preset artifact is missing operation.fields: ${presetArtifactPath}. Using fallback prompt.`);
      return fallbackSystemPrompt;
    }

    const promptField = fields.find((field: unknown) =>
      isRecord(field) && field.key === "llm.prediction.systemPrompt",
    );

    if (!isRecord(promptField) || typeof promptField.value !== "string" || !promptField.value.trim()) {
      warn(`Preset artifact is missing llm.prediction.systemPrompt: ${presetArtifactPath}. Using fallback prompt.`);
      return fallbackSystemPrompt;
    }

    return promptField.value;
  } catch (error) {
    warn(`Failed to read or parse preset artifact at ${presetArtifactPath}. Using fallback prompt.`, error);
    return fallbackSystemPrompt;
  }
}

export function loadEmarComplianceArtifacts() {
  return {
    schema: loadSchemaArtifact(),
    systemPrompt: loadPromptFromPreset(),
  };
}
