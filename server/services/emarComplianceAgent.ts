import { executeSecureTextCompletion } from '../utils/secureAiPipeline';
import { getPreferredModel } from './aiClient';

const complianceSchema = {
  name: "EMARComplianceAudit",
  strict: true,
  schema: {
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
        items: { type: "string" }
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
          totalRecords: { type: "integer" },
          byCode: {
             type: "object",
             additionalProperties: false,
             required: ["R", "SA", "F", "NH", "MU"],
             properties: {
               R: { type: "integer" },
               SA: { type: "integer" },
               F: { type: "integer" },
               NH: { type: "integer" },
               MU: { type: "integer" }
             }
          }
        }
      }
    }
  }
};

const COMPLIANCE_SYSTEM_PROMPT = `TASK
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

export async function runComplianceAgent(documentText: string, aiUserContext: any = { userId: null, username: null }) {
  console.log("Starting strictly-typed Compliance Agent run...");
  const response = await executeSecureTextCompletion({
    endpoint: "/api/admin/emar-audit/compliance",
    feature: "emar_compliance_strict",
    model: getPreferredModel(),
    userContext: aiUserContext,
    systemPrompt: COMPLIANCE_SYSTEM_PROMPT,
    inputText: `EMAR DOCUMENT TEXT:\n\n${documentText}`,
    temperature: 0,
    maxCompletionTokens: 8000,
    responseFormat: { type: "json_schema", json_schema: complianceSchema },
    useCache: false
  });

  return JSON.parse(response.restoredText);
}
