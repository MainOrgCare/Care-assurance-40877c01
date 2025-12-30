import OpenAI from "openai";
import { storage } from "../storage";
import { calculateCostMicroDollars } from "../config/aiPricing";

const primaryClient = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// User context type for logging
export interface AiUserContext {
  userId: string | null;
  username: string | null;
}

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

export async function createChatCompletionWithLogging(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  featureName: string,
  userContext?: AiUserContext
): Promise<OpenAI.ChatCompletion> {
  const startTime = Date.now();
  const model = params.model || "gpt-4o";
  const userId = userContext?.userId || null;
  const username = userContext?.username || null;
  
  // Warn if user context is missing - helps identify calls that need updating
  if (!userContext) {
    console.warn(`[AI:${featureName}] WARNING: No user context provided - cost attribution will be incomplete`);
  }
  
  console.log(`[AI:${featureName}] Starting request with ${model}${username ? ` for ${username}` : ""}...`);
  
  try {
    const result = await createChatCompletion(params);
    const duration = Date.now() - startTime;
    const inputTokens = result.usage?.prompt_tokens || 0;
    const outputTokens = result.usage?.completion_tokens || 0;
    const totalTokens = result.usage?.total_tokens || 0;
    const costMicroDollars = calculateCostMicroDollars(model, inputTokens, outputTokens);
    
    console.log(`[AI:${featureName}] Completed in ${duration}ms, ${totalTokens} tokens, $${(costMicroDollars / 1000000).toFixed(4)}`);
    
    // Log to database asynchronously (don't block the response)
    storage.createAiUsageLog({
      userId,
      username,
      featureName,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      costMicroDollars,
      durationMs: duration,
      success: true,
    }).catch(err => console.error("[AI] Failed to log usage:", err.message));
    
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[AI:${featureName}] Failed after ${duration}ms:`, error.message);
    
    // Log failed attempt
    storage.createAiUsageLog({
      userId,
      username,
      featureName,
      model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costMicroDollars: 0,
      durationMs: duration,
      success: false,
      errorMessage: error.message,
    }).catch(err => console.error("[AI] Failed to log error:", err.message));
    
    throw error;
  }
}

export { primaryClient as openai };
