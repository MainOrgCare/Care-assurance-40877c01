import OpenAI from "openai";
import { storage } from "../storage";
import { calculateCostMicroDollars, AVAILABLE_MODELS, type AvailableModel } from "../config/aiPricing";

// User context type for logging
export interface AiUserContext {
  userId: string | null;
  username: string | null;
}

// Provider type for billing attribution
export type AiProvider = "openai" | "github";

// Admin-configurable preferred AI provider
let preferredProvider: AiProvider = "openai";

// Admin-configurable preferred AI model (defaults to gpt-4.1-mini)
let preferredModel: AvailableModel = "gpt-4.1-mini";

export function getPreferredProvider(): AiProvider {
  return preferredProvider;
}

export function setPreferredProvider(provider: AiProvider): void {
  if (provider !== "openai" && provider !== "github") {
    throw new Error("Invalid provider. Must be 'openai' or 'github'.");
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
let githubClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (openaiClient) return openaiClient;
  
  const fallbackKey = process.env.OPENAI_FALLBACK_API_KEY || process.env.OPENAI_API_KEY;
  if (!fallbackKey) {
    return null;
  }
  
  openaiClient = new OpenAI({
    apiKey: fallbackKey,
    baseURL: process.env.OPENAI_FALLBACK_BASE_URL || "https://api.openai.com/v1",
  });
  
  return openaiClient;
}

function getGitHubClient(): OpenAI | null {
  if (githubClient) return githubClient;
  
  const patKey = process.env.PAT_AI_KEY;
  if (!patKey) {
    return null;
  }
  
  // GitHub AI uses Azure OpenAI compatible endpoint
  githubClient = new OpenAI({
    apiKey: patKey,
    baseURL: "https://models.inference.ai.azure.com",
  });
  
  return githubClient;
}

// Internal function that tracks which provider was used
async function createChatCompletionWithProvider(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming
): Promise<AiCompletionResult> {
  const provider = preferredProvider;
  
  // Get the appropriate client based on preferred provider
  let client: OpenAI | null = null;
  if (provider === "github") {
    client = getGitHubClient();
    if (!client) {
      throw new Error("GitHub AI is not configured. Set PAT_AI_KEY environment variable.");
    }
  } else {
    client = getOpenAIClient();
    if (!client) {
      throw new Error("OpenAI is not configured. Set OPENAI_API_KEY or OPENAI_FALLBACK_API_KEY.");
    }
  }

  // Force model to preferred if not provided
  const model = (params.model as string) || preferredModel;

  console.log(`[AI] Using ${provider} provider with model:`, model);
  const completion = await client.chat.completions.create({ ...params, model });
  return { completion, provider };
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
  const model = (params.model as string) || preferredModel;
  const userId = userContext?.userId || null;
  const username = userContext?.username || null;
  
  // Warn if user context is missing - helps identify calls that need updating
  if (!userContext) {
    console.warn(`[AI:${featureName}] WARNING: No user context provided - cost attribution will be incomplete`);
  }
  
  console.log(`[AI:${featureName}] Starting request with ${model}${username ? ` for ${username}` : ""}...`);
  
  let provider: AiProvider = "openai";
  
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

// Export the configured OpenAI client for legacy imports
export const openai = getOpenAIClient();
