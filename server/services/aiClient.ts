import OpenAI from "openai";

const primaryClient = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

let fallbackClient: OpenAI | null = null;

function getFallbackClient(): OpenAI | null {
  if (fallbackClient) return fallbackClient;
  
  const fallbackKey = process.env.OPENAI_FALLBACK_API_KEY;
  if (!fallbackKey) {
    return null;
  }
  
  fallbackClient = new OpenAI({
    apiKey: fallbackKey,
    baseURL: process.env.OPENAI_FALLBACK_BASE_URL || "https://api.openai.com/v1",
  });
  
  return fallbackClient;
}

function shouldFallback(error: any): boolean {
  const status = error?.status || error?.response?.status;
  if (status === 401 || status === 402 || status === 403 || status === 429 || status >= 500) {
    return true;
  }
  if (error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT" || error?.code === "ENOTFOUND") {
    return true;
  }
  if (error?.message?.toLowerCase().includes("billing") || 
      error?.message?.toLowerCase().includes("quota") ||
      error?.message?.toLowerCase().includes("rate limit")) {
    return true;
  }
  return false;
}

export async function createChatCompletion(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.ChatCompletion> {
  try {
    return await primaryClient.chat.completions.create(params);
  } catch (primaryError: any) {
    if (shouldFallback(primaryError)) {
      const fallback = getFallbackClient();
      if (fallback) {
        console.log("[AI Failover] Primary AI failed, using fallback OpenAI");
        try {
          return await fallback.chat.completions.create(params);
        } catch (fallbackError) {
          console.error("[AI Failover] Fallback also failed:", fallbackError);
          throw fallbackError;
        }
      } else {
        console.warn("[AI Failover] Primary AI failed and no fallback key configured");
      }
    }
    throw primaryError;
  }
}

export { primaryClient as openai };
