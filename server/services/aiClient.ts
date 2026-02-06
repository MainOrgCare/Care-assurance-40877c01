import OpenAI from "openai";
import { storage } from "../storage";
import { calculateCostMicroDollars, AVAILABLE_MODELS, type AvailableModel } from "../config/aiPricing";

// User context type for logging
export interface AiUserContext {
  userId: string | null;
  username: string | null;
}

// Provider type for billing attribution
export type AiProvider = "openai" | "github" | "local";

// Admin-configurable preferred AI provider
let preferredProvider: AiProvider = "openai";

// Admin-configurable preferred AI model (defaults to gpt-4.1-mini)
let preferredModel: AvailableModel = "gpt-4.1-mini";

// Admin-configurable EMAR agent usage (defaults to true)
let useEmarAgent: boolean = true;

// Local LLM configuration
// Render's fromService returns hostname:port, so we need to add http:// if missing
const rawLocalLLMUrl = process.env.LOCAL_LLM_URL || "http://local-llm:11434";
const LOCAL_LLM_URL = rawLocalLLMUrl.startsWith("http") ? rawLocalLLMUrl : `http://${rawLocalLLMUrl}`;
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || "phi3:mini";

export function getPreferredProvider(): AiProvider {
  return preferredProvider;
}

export function setPreferredProvider(provider: AiProvider): void {
  if (provider !== "openai" && provider !== "github" && provider !== "local") {
    throw new Error("Invalid provider. Must be 'openai', 'github', or 'local'.");
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

export function getUseEmarAgent(): boolean {
  return useEmarAgent;
}

export function setUseEmarAgent(enabled: boolean): void {
  useEmarAgent = enabled;
  console.log(`[AI Config] EMAR Agent ${enabled ? 'enabled' : 'disabled'}`);
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

// Local LLM client using Ollama's OpenAI-compatible API
let localClient: OpenAI | null = null;

function getLocalClient(): OpenAI | null {
  if (localClient) return localClient;
  
  // Local LLM doesn't need an API key
  localClient = new OpenAI({
    apiKey: "ollama", // Ollama accepts any key
    baseURL: `${LOCAL_LLM_URL}/v1`,
  });
  
  return localClient;
}

// Check if local LLM is available
async function isLocalLLMAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_LLM_URL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Map OpenAI-specific model names to GitHub AI compatible models
// GitHub AI (models.inference.ai.azure.com) supports: gpt-4o, gpt-4o-mini
function mapModelForGitHub(model: string): string {
  // GitHub AI doesn't support GPT-5.x, GPT-4.1.x series - map to equivalents
  const modelMappings: Record<string, string> = {
    // GPT-5 series -> gpt-4o (highest capability)
    "gpt-5.2": "gpt-4o",
    "gpt-5": "gpt-4o",
    "gpt-5-chat-latest": "gpt-4o",
    "gpt-5-codex": "gpt-4o",
    
    // GPT-5-mini/nano -> gpt-4o-mini (cost-efficient)
    "gpt-5-mini": "gpt-4o-mini",
    "gpt-5-nano": "gpt-4o-mini",
    
    // GPT-4.1 series -> gpt-4o equivalents
    "gpt-4.1": "gpt-4o",
    "gpt-4.1-2026-04-14": "gpt-4o",
    "gpt-4.1-mini": "gpt-4o-mini",
    "gpt-4.1-mini-2026-04-14": "gpt-4o-mini",
    "gpt-4.1-nano": "gpt-4o-mini",
    "gpt-4.1-nano-2026-04-14": "gpt-4o-mini",
    
    // GPT-4o models - pass through (already supported)
    "gpt-4o": "gpt-4o",
    "gpt-4o-2024-11-20": "gpt-4o",
    "gpt-4o-2024-08-06": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4o-mini-2024-07-18": "gpt-4o-mini",
    
    // Legacy models -> gpt-4o equivalents
    "gpt-4-turbo": "gpt-4o",
    "gpt-4-turbo-2024-04-09": "gpt-4o",
    "gpt-4-turbo-preview": "gpt-4o",
    "gpt-3.5-turbo": "gpt-4o-mini",
    "gpt-3.5-turbo-0125": "gpt-4o-mini",
  };
  
  const mapped = modelMappings[model];
  if (mapped && mapped !== model) {
    console.log(`[AI:GitHub] Mapping model ${model} → ${mapped} (GitHub AI compatible)`);
    return mapped;
  }
  
  // Default to gpt-4o-mini if unknown model
  if (!mapped) {
    console.warn(`[AI:GitHub] Unknown model ${model}, defaulting to gpt-4o-mini`);
    return "gpt-4o-mini";
  }
  
  return model;
}

// Retry configuration for rate limit handling
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 5000; // Start with 5 seconds

// Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if error is a rate limit error (429)
function isRateLimitError(error: any): boolean {
  return error?.status === 429 || 
         error?.code === 'rate_limit_exceeded' ||
         error?.message?.includes('429') ||
         error?.message?.toLowerCase().includes('rate limit') ||
         error?.error?.code === 'rate_limit_exceeded';
}

// Internal function that tracks which provider was used
async function createChatCompletionWithProvider(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming
): Promise<AiCompletionResult> {
  const provider = preferredProvider;
  
  // Get the appropriate client based on preferred provider
  let client: OpenAI | null = null;
  let model = (params.model as string) || preferredModel;
  
  if (provider === "local") {
    client = getLocalClient();
    if (!client) {
      throw new Error("Local LLM client could not be initialized.");
    }
    // Always use the local model (phi3:mini)
    model = LOCAL_LLM_MODEL;
    console.log(`[AI:Local] Using local LLM at ${LOCAL_LLM_URL} with model ${model}`);
  } else if (provider === "github") {
    client = getGitHubClient();
    if (!client) {
      throw new Error("GitHub AI is not configured. Set PAT_AI_KEY environment variable.");
    }
    // Map model for GitHub AI compatibility
    model = mapModelForGitHub(model);
  } else {
    client = getOpenAIClient();
    if (!client) {
      throw new Error("OpenAI is not configured. Set OPENAI_API_KEY or OPENAI_FALLBACK_API_KEY.");
    }
  }

  // Retry loop with exponential backoff for rate limit errors
  let lastError: any = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[AI] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms delay...`);
        await sleep(delay);
      }
      
      console.log(`[AI] Using ${provider} provider with model:`, model);
      const completion = await client.chat.completions.create({ ...params, model });
      return { completion, provider };
    } catch (error: any) {
      lastError = error;
      
      if (isRateLimitError(error) && attempt < MAX_RETRIES) {
        // Extract retry-after header if available
        const retryAfter = error?.headers?.get?.('retry-after') || 
                          error?.response?.headers?.['retry-after'];
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[AI] Rate limited (429). Waiting ${waitTime}ms before retry ${attempt + 1}/${MAX_RETRIES}...`);
        continue;
      }
      
      // Non-retryable error or max retries exceeded
      throw error;
    }
  }
  
  // Should not reach here, but throw last error just in case
  throw lastError;
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
  let model = (params.model as string) || preferredModel;
  
  // Map model for GitHub AI if using that provider
  const actualModel = preferredProvider === "github" ? mapModelForGitHub(model) : model;
  
  const userId = userContext?.userId || null;
  const username = userContext?.username || null;
  
  // Warn if user context is missing - helps identify calls that need updating
  if (!userContext) {
    console.warn(`[AI:${featureName}] WARNING: No user context provided - cost attribution will be incomplete`);
  }
  
  console.log(`[AI:${featureName}] Starting request with ${actualModel}${username ? ` for ${username}` : ""} via ${preferredProvider}...`);
  
  let provider: AiProvider = preferredProvider;
  
  try {
    const result = await createChatCompletionWithProvider(params);
    provider = result.provider;
    const duration = Date.now() - startTime;
    const inputTokens = result.completion.usage?.prompt_tokens || 0;
    const outputTokens = result.completion.usage?.completion_tokens || 0;
    const totalTokens = result.completion.usage?.total_tokens || 0;
    const costMicroDollars = calculateCostMicroDollars(actualModel, inputTokens, outputTokens);
    
    console.log(`[AI:${featureName}] Completed in ${duration}ms, ${totalTokens} tokens, $${(costMicroDollars / 1000000).toFixed(4)} via ${provider}`);
    
    // Log to database asynchronously (don't block the response)
    storage.createAiUsageLog({
      userId,
      username,
      featureName,
      model: actualModel,
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
      model: actualModel,
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

// Export function to check if local LLM is available
export { isLocalLLMAvailable };

// Get local LLM URL for admin display
export function getLocalLLMUrl(): string {
  return LOCAL_LLM_URL;
}

// Export the configured OpenAI client for legacy imports
export const openai = getOpenAIClient();
