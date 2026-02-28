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
  console.log("Starting compliance agent run...");
  const response = await executeSecureTextCompletion({
    endpoint: "/api/admin/emar-audit/compliance",
    feature: "emar_compliance",
    model: getPreferredModel(),
    userContext: aiUserContext,
    inputText: `EMAR DOCUMENT TEXT:\n\n${documentText}`,
    temperature: 0,
    maxCompletionTokens: 8000,
    useCache: false
  });

  return JSON.parse(response.restoredText);
}
