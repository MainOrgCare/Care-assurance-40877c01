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
  console.log("[EMAR Compliance] Starting compliance agent run...");
  const response = await executeSecureTextCompletion({
    endpoint: "/api/admin/emar-audit/compliance",
    feature: "emar_compliance",
    model: getPreferredModel(),
    userContext: aiUserContext,
    systemPrompt: "",
    inputText: `EMAR DOCUMENT TEXT:\n\n${documentText}`,
    temperature: 0,
    maxCompletionTokens: 8000,
    useCache: false
  });

  const restored = typeof response?.restoredText === "string" ? response.restoredText.trim() : "";
  if (!restored) {
    console.error("[EMAR Compliance] Empty response from AI pipeline");
    throw new Error("EMAR compliance agent returned an empty response.");
  }

  try {
    return JSON.parse(restored);
  } catch (error) {
    const preview = restored.length > 240 ? `${restored.slice(0, 240)}…` : restored;
    console.error("[EMAR Compliance] Failed to parse AI response as JSON", { error: (error as Error)?.message, preview });
    throw new Error("EMAR compliance agent returned malformed JSON. Please retry the audit.");
  }
}
