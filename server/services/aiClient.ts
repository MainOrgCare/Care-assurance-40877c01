import OpenAI from "openai";
import { storage } from "../storage";
import { calculateCostMicroDollars, AVAILABLE_MODELS, type AvailableModel } from "../config/aiPricing";

let replitClient: OpenAI | null = null;

function getReplitClient(): OpenAI | null {
  if (replitClient) return replitClient;
  
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  
  replitClient = new OpenAI({
    apiKey: apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  
  return replitClient;
}

// User context type for logging
export interface AiUserContext {
  userId: string | null;
  username: string | null;
}

// Provider type for billing attribution
export type AiProvider = "replit" | "openai";

// Admin-configurable preferred AI provider (defaults to Replit)
let preferredProvider: AiProvider = "replit";

// Admin-configurable preferred AI model (defaults to gpt-5.1)
let preferredModel: AvailableModel = "gpt-5.1";

export function getPreferredProvider(): AiProvider {
  return preferredProvider;
}

export function setPreferredProvider(provider: AiProvider): void {
  if (provider !== "replit" && provider !== "openai") {
    throw new Error("Invalid provider. Must be 'replit' or 'openai'");
  }
  preferredProvider = provider;
  console.log(`[AI Config] Preferred provider set to: ${provider}`);
}

export function getPreferredModel(): AvailableModel {
  console.log(`[AI DEBUG] getPreferredModel called, returning: ${preferredModel}`);
  return preferredModel;
}

export function setPreferredModel(model: string): void {
  const validModels = AVAILABLE_MODELS.map(m => m.id);
  if (!validModels.includes(model as AvailableModel)) {
    throw new Error(`Invalid model. Must be one of: ${validModels.join(", ")}`);
  }
  preferredModel = model as AvailableModel;
  console.log(`[AI Config] Preferred model set to: ${model}`);
}

export function getAvailableModels() {
  return AVAILABLE_MODELS;
}

// Result type that includes provider information
export interface AiCompletionResult {
  completion: OpenAI.ChatCompletion;
  provider: AiProvider;
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (openaiClient) return openaiClient;
  
  const fallbackKey = process.env.OPENAI_FALLBACK_API_KEY;
  if (!fallbackKey) {
    return null;
  }
  
  openaiClient = new OpenAI({
    apiKey: fallbackKey,
    baseURL: process.env.OPENAI_FALLBACK_BASE_URL || "https://api.openai.com/v1",
  });
  
  return openaiClient;
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

// Internal function that tracks which provider was used
// Respects admin-configured preferred provider with automatic failover
async function createChatCompletionWithProvider(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming
): Promise<AiCompletionResult> {
  const preferred = preferredProvider;
  const openai = getOpenAIClient();
  const replit = getReplitClient();
  
  // If OpenAI is preferred and available, use it first
  if (preferred === "openai" && openai) {
    console.log("[AI] Admin preferred provider: OpenAI - initiating direct request...");
    try {
      const completion = await openai.chat.completions.create(params);
      return { completion, provider: "openai" };
    } catch (openaiError: any) {
      console.error("[AI] OpenAI preferred request failed, falling back to Replit:", openaiError.message);
      if (shouldFallback(openaiError) && replit) {
        try {
          const completion = await replit.chat.completions.create(params);
          return { completion, provider: "replit" };
        } catch (replitError: any) {
          console.error("[AI] Replit fallback also failed:", replitError.message);
          throw replitError;
        }
      }
      throw openaiError;
    }
  }
  
  // Default: Use Replit first with OpenAI fallback
  if (!replit && !openai) {
    throw new Error("No AI provider is configured. Please set either AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_FALLBACK_API_KEY");
  }
  
  if (replit) {
    try {
      const completion = await replit.chat.completions.create(params);
      return { completion, provider: "replit" };
    } catch (replitError: any) {
      if (shouldFallback(replitError) && openai) {
        console.log("[AI Failover] Replit failed, using OpenAI fallback");
        try {
          const completion = await openai.chat.completions.create(params);
          return { completion, provider: "openai" };
        } catch (openaiError: any) {
          console.error("[AI Failover] OpenAI fallback also failed:", openaiError.message);
          throw openaiError;
        }
      } else if (!openai) {
        console.warn("[AI Failover] Replit failed and no OpenAI fallback key configured");
      }
      throw replitError;
    }
  }
  
  // If only OpenAI is available (no Replit client)
  if (openai) {
    try {
      const completion = await openai.chat.completions.create(params);
      return { completion, provider: "openai" };
    } catch (openaiError: any) {
      throw openaiError;
    }
  }
  
  throw new Error("No AI provider is available");
}

// Legacy function for backwards compatibility (returns just the completion)
export async function createChatCompletion(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.ChatCompletion> {
  const result = await createChatCompletionWithProvider(params);
  return result.completion;
}

export async function createChatCompletionWithLogging(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  featureName: string,
  userContext?: AiUserContext
): Promise<OpenAI.ChatCompletion> {
  const startTime = Date.now();
  // Ensure we use the model passed in params, which should be from getPreferredModel()
  const model = params.model as string || "gpt-4o";
  const userId = userContext?.userId || null;
  const username = userContext?.username || null;
  
  // Warn if user context is missing - helps identify calls that need updating
  if (!userContext) {
    console.warn(`[AI:${featureName}] WARNING: No user context provided - cost attribution will be incomplete`);
  }
  
  console.log(`[AI:${featureName}] Starting request with ${model}${username ? ` for ${username}` : ""}...`);
  
  let provider: AiProvider = "replit";
  
  try {
    const result = await createChatCompletionWithProvider(params);
    provider = result.provider;
    const duration = Date.now() - startTime;
    const inputTokens = result.completion.usage?.prompt_tokens || 0;
    const outputTokens = result.completion.usage?.completion_tokens || 0;
    const totalTokens = result.completion.usage?.total_tokens || 0;
    const costMicroDollars = calculateCostMicroDollars(model, inputTokens, outputTokens);
    
    console.log(`[AI:${featureName}] Completed in ${duration}ms, ${totalTokens} tokens, $${(costMicroDollars / 1000000).toFixed(4)} via ${provider}`);
    
    // Log to database asynchronously (don't block the response)
    storage.createAiUsageLog({
      userId,
      username,
      featureName,
      model,
      billingSource: provider,
      provider,
      inputTokens,
      outputTokens,
      totalTokens,
      costMicroDollars,
      durationMs: duration,
    }).catch(err => console.error("[AI] Failed to log usage:", err.message));
    
    return result.completion;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[AI:${featureName}] Failed after ${duration}ms:`, error.message);
    
    // Log failed attempt
    storage.createAiUsageLog({
      userId,
      username,
      featureName,
      model,
      billingSource: provider,
      provider,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costMicroDollars: 0,
      durationMs: duration,
    }).catch(err => console.error("[AI] Failed to log error:", err.message));
    
    throw error;
  }
}

export const openai = getReplitClient();
