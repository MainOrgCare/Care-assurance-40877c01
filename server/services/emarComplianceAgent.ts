import { executeSecureTextCompletion } from '../utils/secureAiPipeline';
import { loadEmarComplianceArtifacts } from '../utils/emarComplianceArtifacts';
import { getPreferredModel } from './aiClient';

const { schema, systemPrompt } = loadEmarComplianceArtifacts();

export const complianceSchema = {
  name: "EMARComplianceAudit",
  strict: true,
  schema,
};

export const COMPLIANCE_SYSTEM_PROMPT = systemPrompt;

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
