import OpenAI from "openai";
let storageRef: typeof import("../storage").storage | null = null;

const getStorage = async () => {
  if (storageRef) return storageRef;
  const module = await import("../storage");
  storageRef = module.storage;
  return storageRef;
};
import { calculateCostMicroDollars, AVAILABLE_MODELS, type AvailableModel } from "../config/aiPricing";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "./aiCache";
import { shouldUseAI, extractCommonFields } from "./ruleBasedEngine";
import { scrubMessagesForLog, detectHighRiskPII } from "../utils/piiVault";
import { logSecurityEvent } from "../utils/securityAudit";

// User context type for logging
export interface AiUserContext {
  userId: string | null;
  username: string | null;
}

// Provider type for billing attribution
export type AiProvider = "openai" | "github" | "local";

const parseBoolean = (value: string | undefined | null, fallback: boolean): boolean => {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const IS_CODESPACES = parseBoolean(process.env.CODESPACES, false);
const LOCAL_LLM_ENABLED = parseBoolean(process.env.LOCAL_LLM_ENABLED, !IS_CODESPACES);
const LOCAL_LLM_DISABLED_MESSAGE = "Local LLM is disabled in this environment. Set LOCAL_LLM_ENABLED=true to re-enable.";

function getFallbackProviderWhenLocalDisabled(): AiProvider {
  if (process.env.PAT_AI_KEY) return "github";
  if (process.env.OPENAI_FALLBACK_API_KEY || process.env.OPENAI_API_KEY) return "openai";
  return "github";
}

const AI_ENABLED_BY_ENV = parseBoolean(process.env.AI_ENABLED, false);
const AI_ENV_LOCKED_DISABLED = !AI_ENABLED_BY_ENV;
export const AI_DISABLED_BY_ENV_MESSAGE = "AI features are disabled by policy (AI_ENABLED is not true). Use rule-based workflows or ask an admin to enable AI in deployment settings.";
export const AI_DISABLED_BY_ADMIN_MESSAGE = "AI features are disabled in app settings. Ask an admin to enable AI in Secret Admin Portal > AI Optimization.";
export const getAIDisabledMessage = (): string => (
  AI_ENV_LOCKED_DISABLED ? AI_DISABLED_BY_ENV_MESSAGE : AI_DISABLED_BY_ADMIN_MESSAGE
);

const createAIDisabledError = (): Error => {
  const error = new Error(getAIDisabledMessage()) as Error & { code?: string };
  error.code = "AI_DISABLED";
  return error;
};

// Admin-configurable preferred AI provider (openai uses OPENAI_API_KEY)
let preferredProvider: AiProvider = "openai";
let settingsLoaded = false;
let settingsLoadPromise: Promise<void> | null = null;
let aiEnabled: boolean = AI_ENABLED_BY_ENV;

// Admin-configurable preferred AI model (defaults to gpt-4.1-mini)
let preferredModel: AvailableModel = "gpt-4.1-mini";

// Admin-configurable EMAR agent usage (defaults to true)
let useEmarAgent: boolean = aiEnabled;

// AI Optimization Settings - reduces API calls and costs
let useAICache: boolean = true;  // Cache AI responses for identical inputs
let useRulesFirst: boolean = true;  // Try rule-based engine before AI
let aiLiteMode: boolean = false;  // Use minimal prompts where possible

// Local LLM configuration
// Render's fromService returns hostname:port, so we need to add http:// if missing
const rawLocalLLMUrl = process.env.LOCAL_LLM_URL || "http://local-llm:11434";
const LOCAL_LLM_URL = rawLocalLLMUrl.startsWith("http") ? rawLocalLLMUrl : `http://${rawLocalLLMUrl}`;
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || "qwen2.5-64k";

// Load settings from database (called once on first AI request)
// Uses a promise-based mutex so concurrent callers share a single DB read.
async function ensureSettingsLoaded(): Promise<void> {
  if (settingsLoaded) return;

  // If a load is already in-flight, wait for it
  if (settingsLoadPromise) {
    await settingsLoadPromise;
    return;
  }

  settingsLoadPromise = (async () => {
    try {
      const storage = await getStorage();
      const savedProvider = await storage.getAppSetting("ai_provider");
      if (savedProvider && (savedProvider === "openai" || savedProvider === "github" || savedProvider === "local")) {
        preferredProvider = savedProvider as AiProvider;
        if (preferredProvider === "local" && !LOCAL_LLM_ENABLED) {
          const fallbackProvider = getFallbackProviderWhenLocalDisabled();
          preferredProvider = fallbackProvider;
          console.log(`[AI Config] Local LLM disabled by environment; using ${fallbackProvider} provider`);
        } else {
          console.log(`[AI Config] Loaded provider from DB: ${preferredProvider}`);
        }
      }

      const savedAIEnabled = await storage.getAppSetting("ai_enabled");
      if (!AI_ENV_LOCKED_DISABLED && savedAIEnabled !== null) {
        aiEnabled = savedAIEnabled === "true";
        console.log(`[AI Config] Loaded AI enabled flag from DB: ${aiEnabled}`);
      } else if (AI_ENV_LOCKED_DISABLED) {
        aiEnabled = false;
        console.log("[AI Config] AI disabled by environment policy (AI_ENABLED is not true)");
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
        useEmarAgent = aiEnabled && savedEmarAgent === "true";
        console.log(`[AI Config] Loaded EMAR agent from DB: ${useEmarAgent}`);
      }
      
      // Load optimization settings
      const savedCache = await storage.getAppSetting("ai_cache");
      if (savedCache !== null) {
        useAICache = savedCache === "true";
        console.log(`[AI Config] Loaded cache setting from DB: ${useAICache}`);
      }
      
      const savedRules = await storage.getAppSetting("ai_rules_first");
      if (savedRules !== null) {
        useRulesFirst = savedRules === "true";
        console.log(`[AI Config] Loaded rules-first setting from DB: ${useRulesFirst}`);
      }
      
      const savedLite = await storage.getAppSetting("ai_lite_mode");
      if (savedLite !== null) {
        aiLiteMode = savedLite === "true";
        console.log(`[AI Config] Loaded lite mode from DB: ${aiLiteMode}`);
      }
      
      settingsLoaded = true;
    } catch (error) {
      console.warn("[AI Config] Could not load settings from DB, using defaults:", error);
      // Do NOT set settingsLoaded=true on error — retry on next request
    } finally {
      settingsLoadPromise = null;
    }
  })();

  await settingsLoadPromise;
}

export function getPreferredProvider(): AiProvider {
  return preferredProvider;
}

export function isAIEnabled(): boolean {
  return aiEnabled;
}

export function setAIEnabled(enabled: boolean, persist: boolean = false): void {
  if (enabled && AI_ENV_LOCKED_DISABLED) {
    throw new Error("AI cannot be enabled while AI_ENABLED environment variable is not set to true.");
  }
  aiEnabled = enabled;
  if (!aiEnabled) {
    useEmarAgent = false;
  }
  console.log(`[AI Config] AI ${aiEnabled ? "enabled" : "disabled"}${persist ? " (persisted)" : ""}`);

  if (persist) {
    void getStorage()
      .then(storage => storage.setAppSetting("ai_enabled", aiEnabled ? "true" : "false"))
      .catch(err => console.error("[AI Config] Failed to persist AI enabled setting:", err.message));
    if (!aiEnabled) {
      void getStorage()
        .then(storage => storage.setAppSetting("emar_agent", "false"))
        .catch(err => console.error("[AI Config] Failed to persist EMAR agent disable:", err.message));
    }
  }
}

export function setPreferredProvider(provider: AiProvider, persist: boolean = false): void {
  if (provider !== "openai" && provider !== "github" && provider !== "local") {
    throw new Error("Invalid provider. Must be 'openai', 'github', or 'local'.");
  }
  if (provider === "local" && !LOCAL_LLM_ENABLED) {
    throw new Error(LOCAL_LLM_DISABLED_MESSAGE);
  }
  preferredProvider = provider;
  console.log(`[AI Config] Preferred provider set to: ${provider}${persist ? " (persisted)" : ""}`);
  
  if (persist) {
    void getStorage()
      .then(storage => storage.setAppSetting("ai_provider", provider))
      .catch(err => console.error("[AI Config] Failed to persist provider:", err.message));
  }
}

export function getPreferredModel(): AvailableModel {
  return preferredModel;
}

export function getUseEmarAgent(): boolean {
  return useEmarAgent;
}

export function setUseEmarAgent(enabled: boolean, persist: boolean = false): void {
  useEmarAgent = aiEnabled && enabled;
  console.log(`[AI Config] EMAR Agent ${useEmarAgent ? 'enabled' : 'disabled'}${persist ? " (persisted)" : ""}`);
  
  if (persist) {
    void getStorage()
      .then(storage => storage.setAppSetting("emar_agent", useEmarAgent ? "true" : "false"))
      .catch(err => console.error("[AI Config] Failed to persist EMAR agent setting:", err.message));
  }
}

// AI Optimization Getters/Setters
export function getUseAICache(): boolean {
  return useAICache;
}

export function setUseAICache(enabled: boolean, persist: boolean = false): void {
  useAICache = enabled;
  console.log(`[AI Config] AI Cache ${enabled ? 'enabled' : 'disabled'}${persist ? " (persisted)" : ""}`);
  if (persist) {
    void getStorage()
      .then(storage => storage.setAppSetting("ai_cache", enabled ? "true" : "false"))
      .catch(err => console.error("[AI Config] Failed to persist cache setting:", err.message));
  }
}

export function getUseRulesFirst(): boolean {
  return useRulesFirst;
}

export function setUseRulesFirst(enabled: boolean, persist: boolean = false): void {
  useRulesFirst = enabled;
  console.log(`[AI Config] Rules-First ${enabled ? 'enabled' : 'disabled'}${persist ? " (persisted)" : ""}`);
  if (persist) {
    void getStorage()
      .then(storage => storage.setAppSetting("ai_rules_first", enabled ? "true" : "false"))
      .catch(err => console.error("[AI Config] Failed to persist rules-first setting:", err.message));
  }
}

export function getAILiteMode(): boolean {
  return aiLiteMode;
}

export function setAILiteMode(enabled: boolean, persist: boolean = false): void {
  aiLiteMode = enabled;
  console.log(`[AI Config] AI Lite Mode ${enabled ? 'enabled' : 'disabled'}${persist ? " (persisted)" : ""}`);
  if (persist) {
    void getStorage()
      .then(storage => storage.setAppSetting("ai_lite_mode", enabled ? "true" : "false"))
      .catch(err => console.error("[AI Config] Failed to persist lite mode setting:", err.message));
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
  if (!LOCAL_LLM_ENABLED) return null;
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
  if (!LOCAL_LLM_ENABLED) return false;
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

// Per-request overall timeout (prevents indefinitely hanging calls)
// Plan Enhancer sends ~5K-word system prompt + documents and requests up to 32K output tokens,
// which regularly exceeds 2 minutes. 5 minutes covers large generations with retries.
const AI_CALL_TIMEOUT_MS = 300_000; // 5 minutes

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

// Format GitHub Models specific errors with helpful messages
function formatGitHubModelsError(error: any, provider: AiProvider): Error {
  const isGitHub = provider === 'github' || (provider === 'openai' && openaiUsingPATFallback);
  if (!isGitHub) return error;
  
  const status = error?.status || error?.response?.status;
  const message = error?.message || '';
  
  // GitHub Models quota exceeded (429)
  if (status === 429 || message.includes('429') || message.toLowerCase().includes('quota')) {
    const enhancedError = new Error(
      'GitHub Models API quota exceeded. Your Personal Access Token (PAT_AI_KEY) has hit its rate limit. ' +
      'Options: 1) Wait for quota to reset, 2) Use a different token, or 3) Switch to OpenAI provider in Secret Admin Portal.'
    ) as Error & { code?: string; originalError?: any };
    enhancedError.code = 'GITHUB_QUOTA_EXCEEDED';
    enhancedError.originalError = error;
    return enhancedError;
  }
  
  // GitHub Models permissions error (401)
  if (status === 401 && (message.includes('models') || message.includes('permission'))) {
    const enhancedError = new Error(
      'GitHub Models API permission denied. Your Personal Access Token (PAT_AI_KEY) needs the "models" scope. ' +
      'Please generate a new token with "models" permission at https://github.com/settings/tokens, or switch to OpenAI provider.'
    ) as Error & { code?: string; originalError?: any };
    enhancedError.code = 'GITHUB_PERMISSION_DENIED';
    enhancedError.originalError = error;
    return enhancedError;
  }
  
  // Generic GitHub authentication error (401)
  if (status === 401) {
    const enhancedError = new Error(
      'GitHub Models API authentication failed. Your PAT_AI_KEY may be invalid or expired. ' +
      'Generate a new token at https://github.com/settings/tokens with "models" scope.'
    ) as Error & { code?: string; originalError?: any };
    enhancedError.code = 'GITHUB_AUTH_FAILED';
    enhancedError.originalError = error;
    return enhancedError;
  }
  
  return error;
}

// Internal function that tracks which provider was used
async function createChatCompletionWithProvider(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming
): Promise<AiCompletionResult> {
  if (!aiEnabled) {
    throw createAIDisabledError();
  }

  const provider = preferredProvider;
  
  // Get the appropriate client based on preferred provider
  let client: OpenAI | null = null;
  let model = (params.model as string) || preferredModel;
  
  if (provider === "local") {
    if (!LOCAL_LLM_ENABLED) {
      throw new Error(LOCAL_LLM_DISABLED_MESSAGE);
    }
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
    } else {
      console.log(`[AI:OpenAI] ✓ Using OpenAI directly (model: ${model}, temp: ${(params as any).temperature ?? 0})`);
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
      // For OpenAI provider, enforce gpt-4.1-mini with temperature 0 for deterministic results
      const finalParams = provider === "local" 
        ? { 
            ...params, 
            model, 
            temperature: 0,
            // Ollama-specific: ensure context window size via options
            options: { num_ctx: 65536 }
          }
        : provider === "openai" && !openaiUsingPATFallback
        ? { 
            ...params, 
            model: model || "gpt-4.1-mini",
            temperature: params.temperature ?? 0,
          }
        : { ...params, model };

      // Wrap in overall timeout to prevent indefinite hangs
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(
          `AI request timed out after ${AI_CALL_TIMEOUT_MS / 1000}s (model: ${model}, provider: ${provider})`
        )), AI_CALL_TIMEOUT_MS);
      });
      const completion = await Promise.race([
        client.chat.completions.create(finalParams),
        timeoutPromise,
      ]);
      return { completion, provider };
    } catch (error: any) {
      lastError = error;
      
      // Log the error for debugging
      console.error(`[AI:${provider}] Error on attempt ${attempt + 1}:`, {
        status: error?.status || error?.response?.status,
        message: error?.message,
        code: error?.code
      });
      
      if (isRateLimitError(error) && attempt < MAX_RETRIES) {
        // Extract retry-after header if available
        const retryAfter = error?.headers?.get?.('retry-after') || 
                          error?.response?.headers?.['retry-after'];
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[AI:${provider}] Rate limited (429). Waiting ${waitTime}ms before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await sleep(waitTime);
        continue;
      }
      
      // Non-retryable error or max retries exceeded - format and throw
      throw formatGitHubModelsError(error, provider);
    }
  }
  
  // Should not reach here, but throw last error with formatting just in case
  throw formatGitHubModelsError(lastError, provider);
}

export async function createChatCompletionWithLogging(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  featureName: string,
  userContext?: AiUserContext
): Promise<OpenAI.ChatCompletion> {
  const startTime = Date.now();
  if (!aiEnabled) {
    const duration = Date.now() - startTime;
    console.warn(`[AI:${featureName}] Blocked in ${duration}ms: AI disabled by security policy`);
    throw createAIDisabledError();
  }

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

  const scanForPII = (messages: Array<{ role: string; content: any }>) => {
    let total = 0;
    const byCategory: Record<string, number> = {};
    const checkText = (text: string) => {
      const findings = detectHighRiskPII(text);
      if (findings.total === 0) return;
      total += findings.total;
      for (const [key, count] of Object.entries(findings.byCategory)) {
        byCategory[key] = (byCategory[key] || 0) + count;
      }
    };

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        checkText(msg.content);
        continue;
      }
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part?.type === "text" && typeof part.text === "string") {
            checkText(part.text);
          }
        }
      }
    }

    return { total, byCategory };
  };

  const piiFindings = scanForPII(params.messages as Array<{ role: string; content: any }>);
  if (piiFindings.total > 0) {
    logSecurityEvent({
      eventType: "SUSPICIOUS_INPUT",
      endpoint: `ai:${featureName}`,
      userId,
      username,
      details: {
        reason: "pii_detected_in_ai_prompt",
        categories: Object.keys(piiFindings.byCategory),
        totalItems: piiFindings.total,
      },
    });
    throw new Error("PII detected in AI prompt. Scrub content with PIIVault before calling AI.");
  }
  
  // Check cache if enabled
  const cacheKey = useAICache ? generateCacheKey(params.messages as any, actualModel, featureName) : null;
  if (cacheKey) {
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      const duration = Date.now() - startTime;
      console.log(`[AI:${featureName}] ⚡ CACHE HIT - returned in ${duration}ms (saved API call)`);
      
      // Log cache hit (0 cost)
      const storage = await getStorage().catch(() => null);
      if (storage) {
        storage.createAiUsageLog({
        userId,
        username,
        featureName: `${featureName}:cached`,
        model: actualModel,
        billingSource: "cache" as any,
        provider: preferredProvider,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costMicroDollars: 0,
        durationMs: duration,
        requestPayload: {
          model: actualModel,
          messages: scrubMessagesForLog(params.messages as any),
          temperature: params.temperature,
          max_completion_tokens: params.max_completion_tokens || params.max_tokens,
          response_format: params.response_format,
          provider: preferredProvider,
          featureName: featureName,
          cached: true,
        },
        }).catch(err => console.error("[AI] Failed to log cache hit:", err.message));
      }
      
      return cachedResponse.result as OpenAI.ChatCompletion;
    }
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
    
    // Cache the successful response if caching enabled
    if (cacheKey) {
      setCachedResponse(cacheKey, result.completion, featureName, totalTokens);
    }
    
    // Log to database asynchronously (don't block the response)
    const storage = await getStorage().catch(() => null);
    if (storage) {
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
      requestPayload: {
        model: actualModel,
        messages: scrubMessagesForLog(params.messages as any),
        temperature: params.temperature,
        max_completion_tokens: params.max_completion_tokens || params.max_tokens,
        response_format: params.response_format,
        provider: provider,
        featureName: featureName,
      },
      }).catch(err => console.error("[AI] Failed to log usage:", err.message));
    }
    
    return result.completion;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[AI:${featureName}] Failed after ${duration}ms:`, error.message);
    
    // Log failed attempt
    const storage = await getStorage().catch(() => null);
    if (storage) {
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
      requestPayload: {
        model: actualModel,
        messages: scrubMessagesForLog(params.messages as any),
        temperature: params.temperature,
        max_completion_tokens: params.max_completion_tokens || params.max_tokens,
        response_format: params.response_format,
        provider: provider,
        featureName: featureName,
        error: error.message,
      },
      }).catch(err => console.error("[AI] Failed to log error:", err.message));
    }
    
    throw error;
  }
}

/**
 * Hybrid completion: tries rule-based extraction first, falls back to AI only if needed
 * Significantly reduces AI costs for common extraction patterns
 */
export async function createHybridCompletion(
  content: string,
  taskType: "risk_assessment" | "care_plan" | "simple_extraction",
  featureName: string,
  userContext: AiUserContext,
  model?: string
): Promise<{ result: any; usedAI: boolean; reason: string }> {
  await ensureSettingsLoaded();
  const decision = shouldUseAI(taskType, content);

  if (!aiEnabled) {
    const fallback = decision.ruleBasedResult || extractCommonFields(content);
    return {
      result: fallback,
      usedAI: false,
      reason: `${decision.reason}; AI disabled by security policy`,
    };
  }
  
  // If rules-first is disabled, go straight to AI
  if (!useRulesFirst) {
    console.log(`[Hybrid:${featureName}] Rules-first disabled, using AI directly`);
    // Build prompts and call AI directly
    let systemPrompt = "";
    let userPrompt = "";
    switch (taskType) {
      case "risk_assessment":
        systemPrompt = "You are a care risk assessment expert. Analyze the provided content and determine the risk level (Low, Medium, High) with supporting evidence.";
        userPrompt = `Analyze this content for risk factors:\n\n${content}\n\nProvide:\n1. Risk level (Low/Medium/High)\n2. Key risk factors identified\n3. Recommended mitigations`;
        break;
      case "care_plan":
        systemPrompt = "You are a care plan writer. Create person-centered care content in the first person (I, my, me).";
        userPrompt = `Based on this information, create care plan content:\n\n${content}`;
        break;
      case "simple_extraction":
        systemPrompt = "Extract key information from the provided text and return as structured data.";
        userPrompt = `Extract key fields from:\n\n${content}`;
        break;
    }
    if (aiLiteMode) {
      systemPrompt = "Be concise. Respond with key facts only.";
    }
    const directCompletion = await createChatCompletionWithLogging(
      {
        model: model || preferredModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1000
      },
      featureName,
      userContext
    );
    const directContent = directCompletion.choices[0]?.message?.content || "";
    return {
      result: { aiGenerated: true, content: directContent },
      usedAI: true,
      reason: "Rules-first disabled in settings"
    };
  }
  
  // Try rule-based extraction first
  if (!decision.useAI && decision.ruleBasedResult) {
    console.log(`[Hybrid:${featureName}] Using rule-based result (${decision.reason})`);
    return { 
      result: decision.ruleBasedResult, 
      usedAI: false, 
      reason: decision.reason 
    };
  }
  
  // Rules insufficient, need AI
  console.log(`[Hybrid:${featureName}] Rules insufficient (${decision.reason}), falling back to AI`);
  
  // Build appropriate prompt based on task type
  let systemPrompt = "";
  let userPrompt = "";
  
  switch (taskType) {
    case "risk_assessment":
      systemPrompt = "You are a care risk assessment expert. Analyze the provided content and determine the risk level (Low, Medium, High) with supporting evidence.";
      userPrompt = `Analyze this content for risk factors:\n\n${content}\n\nProvide:\n1. Risk level (Low/Medium/High)\n2. Key risk factors identified\n3. Recommended mitigations`;
      break;
    case "care_plan":
      systemPrompt = "You are a care plan writer. Create person-centered care content in the first person (I, my, me).";
      userPrompt = `Based on this information, create care plan content:\n\n${content}`;
      break;
    case "simple_extraction":
      systemPrompt = "Extract key information from the provided text and return as structured data.";
      userPrompt = `Extract key fields from:\n\n${content}`;
      break;
  }
  
  // If lite mode, use simplified prompts
  if (aiLiteMode) {
    systemPrompt = "Be concise. Respond with key facts only.";
  }
  
  const completion = await createChatCompletionWithLogging(
    {
      model: model || preferredModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    },
    featureName,
    userContext
  );
  
  const aiContent = completion.choices[0]?.message?.content || "";
  
  return {
    result: { 
      aiGenerated: true, 
      content: aiContent,
      ruleBasedPartial: decision.ruleBasedResult 
    },
    usedAI: true,
    reason: decision.reason
  };
}

// Export function to check if local LLM is available
export { isLocalLLMAvailable };

// Get local LLM URL for admin display
export function getLocalLLMUrl(): string {
  return LOCAL_LLM_URL;
}

// Export getter for OpenAI client (lazy — always reflects current AI state)
export function getOpenAI(): OpenAI | null {
  return aiEnabled ? getOpenAIClient() : null;
}
