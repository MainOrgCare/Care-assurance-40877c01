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

// Admin-configurable preferred AI provider (github uses PAT_AI_KEY)
let preferredProvider: AiProvider = "github";
let settingsLoaded = false;

// Admin-configurable preferred AI model (defaults to gpt-4.1-mini)
let preferredModel: AvailableModel = "gpt-4.1-mini";

// Admin-configurable EMAR agent usage (defaults to true)
let useEmarAgent: boolean = true;

// Local LLM configuration
// Render's fromService returns hostname:port, so we need to add http:// if missing
const rawLocalLLMUrl = process.env.LOCAL_LLM_URL || "http://local-llm:11434";
const LOCAL_LLM_URL = rawLocalLLMUrl.startsWith("http") ? rawLocalLLMUrl : `http://${rawLocalLLMUrl}`;
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || "qwen2.5-64k";

// Load settings from database (called once on first AI request)
async function ensureSettingsLoaded(): Promise<void> {
  if (settingsLoaded) return;
  
  try {
    const savedProvider = await storage.getAppSetting("ai_provider");
    if (savedProvider && (savedProvider === "openai" || savedProvider === "github" || savedProvider === "local")) {
      preferredProvider = savedProvider as AiProvider;
      console.log(`[AI Config] Loaded provider from DB: ${preferredProvider}`);
    }
    
    const savedModel = await storage.getAppSetting("ai_model");
    if (savedModel) {
      const validModels = AVAILABLE_MODELS.map(m => m.id);
      if (validModels.includes(savedModel as AvailableModel)) {
        preferredModel = savedModel as AvailableModel;
        console.log(`[AI Config] Loaded model from DB: ${preferredModel}`);
      }
    }
    
    const savedEmarAgent = await storage.getAppSetting("emar_agent");
    if (savedEmarAgent !== null) {
      useEmarAgent = savedEmarAgent === "true";
      console.log(`[AI Config] Loaded EMAR agent from DB: ${useEmarAgent}`);
    }
    
    settingsLoaded = true;
  } catch (error) {
    console.warn("[AI Config] Could not load settings from DB, using defaults:", error);
    settingsLoaded = true; // Don't retry on error
  }
}

export function getPreferredProvider(): AiProvider {
  return preferredProvider;
}

export function setPreferredProvider(provider: AiProvider, persist: boolean = false): void {
  if (provider !== "openai" && provider !== "github" && provider !== "local") {
    throw new Error("Invalid provider. Must be 'openai', 'github', or 'local'.");
  }
  preferredProvider = provider;
  console.log(`[AI Config] Preferred provider set to: ${provider}${persist ? " (persisted)" : ""}`);
  
  if (persist) {
    storage.setAppSetting("ai_provider", provider).catch(err => 
      console.error("[AI Config] Failed to persist provider:", err.message)
    );
  }
}

export function getPreferredModel(): AvailableModel {
  console.log(`[AI DEBUG] getPreferredModel called, returning: ${preferredModel}`);
  return preferredModel;
}

export function setPreferredModel(model: string, persist: boolean = false): void {
  const validModels = AVAILABLE_MODELS.map(m => m.id);
  if (!validModels.includes(model as AvailableModel)) {
    throw new Error(`Invalid model. Must be one of: ${validModels.join(", ")}`);
  }
  preferredModel = model as AvailableModel;
  console.log(`[AI Config] Preferred model set to: ${model}${persist ? " (persisted)" : ""}`);
  
  if (persist) {
    storage.setAppSetting("ai_model", model).catch(err => 
      console.error("[AI Config] Failed to persist model:", err.message)
    );
  }
}

export function getAvailableModels() {
  return AVAILABLE_MODELS;
}

export function getUseEmarAgent(): boolean {
  return useEmarAgent;
}

export function setUseEmarAgent(enabled: boolean, persist: boolean = false): void {
  useEmarAgent = enabled;
  console.log(`[AI Config] EMAR Agent ${enabled ? 'enabled' : 'disabled'}${persist ? " (persisted)" : ""}`);
  
  if (persist) {
    storage.setAppSetting("emar_agent", enabled ? "true" : "false").catch(err => 
      console.error("[AI Config] Failed to persist EMAR agent setting:", err.message)
    );
  }
}

// Export ensureSettingsLoaded for routes initialization
export { ensureSettingsLoaded };

// Result type that includes provider information
export interface AiCompletionResult {
  completion: OpenAI.ChatCompletion;
  provider: AiProvider;
}

let openaiClient: OpenAI | null = null;
let githubClient: OpenAI | null = null;

// Track if OpenAI client is using PAT fallback (needs model mapping)
let openaiUsingPATFallback = false;

function getOpenAIClient(): OpenAI | null {
  if (openaiClient) return openaiClient;
  
  // Try OpenAI keys first
  const openaiKey = process.env.OPENAI_FALLBACK_API_KEY || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    openaiUsingPATFallback = false;
    openaiClient = new OpenAI({
      apiKey: openaiKey,
      baseURL: process.env.OPENAI_FALLBACK_BASE_URL || "https://api.openai.com/v1",
    });
    return openaiClient;
  }
  
  // Fall back to PAT_AI_KEY via GitHub endpoint if no OpenAI key
  const patKey = process.env.PAT_AI_KEY;
  if (patKey) {
    console.log("[AI] No OpenAI key found, using PAT_AI_KEY via GitHub endpoint as OpenAI fallback");
    openaiUsingPATFallback = true;
    openaiClient = new OpenAI({
      apiKey: patKey,
      baseURL: "https://models.inference.ai.azure.com",
    });
    return openaiClient;
  }
  
  return null;
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
    // Always use the local model - NO FALLBACK to other providers
    model = LOCAL_LLM_MODEL;
    console.log(`[AI:Local] ✓ Using LOCAL Qwen 2.5 at ${LOCAL_LLM_URL} (model: ${model}, temp: 0) - NOT using OpenAI/GitHub`);
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
      throw new Error("No AI configured. Set OPENAI_API_KEY, OPENAI_FALLBACK_API_KEY, or PAT_AI_KEY.");
    }
    // If using PAT fallback, we're actually hitting GitHub endpoint - needs model mapping
    if (openaiUsingPATFallback) {
      model = mapModelForGitHub(model);
      console.log(`[AI:OpenAI] Using PAT_AI_KEY fallback via GitHub endpoint`);
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
      // For local LLM (qwen2.5-64k custom model), temperature 0 and 64K context are baked in
      // Also pass options as fallback for API-level override
      const finalParams = provider === "local" 
        ? { 
            ...params, 
            model, 
            temperature: 0,
            // Ollama-specific: ensure context window size via options
            options: { num_ctx: 65536 }
          }
        : { ...params, model };
      const completion = await client.chat.completions.create(finalParams);
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
  
  // For local provider, always use the local model name
  // For GitHub AI or OpenAI with PAT fallback, map to compatible model
  let actualModel: string;
  if (preferredProvider === "local") {
    actualModel = LOCAL_LLM_MODEL; // phi3:mini
  } else {
    const needsMapping = preferredProvider === "github" || (preferredProvider === "openai" && openaiUsingPATFallback);
    actualModel = needsMapping ? mapModelForGitHub(model) : model;
  }
  
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
    
    const providerLabel = provider === "local" ? "LOCAL (Qwen 2.5)" : provider === "github" ? "GitHub AI" : "OpenAI";
    console.log(`[AI:${featureName}] ✓ Completed in ${duration}ms, ${totalTokens} tokens, $${(costMicroDollars / 1000000).toFixed(4)} via ${providerLabel}`);
    
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
