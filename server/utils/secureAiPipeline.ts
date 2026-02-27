import { createChatCompletionWithLogging, type AiUserContext } from "../services/aiClient";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "../services/aiCache";
import { PIIVault } from "./piiVault";

type SecureTextCompletionOptions = {
  endpoint: string;
  feature: string;
  model: string;
  userContext: AiUserContext;
  inputText: string;
  systemPrompt: string;
  temperature?: number;
  maxCompletionTokens?: number;
  seed?: number;
  responseFormat?: { type: "json_object" };
  useCache?: boolean;
  cacheScope?: string;
};

type SecureTextCompletionResult = {
  restoredText: string;
  rawWithTokens: string;
  vaultExport: ReturnType<PIIVault["export"]>;
  wasCached: boolean;
  finishReason?: string | null;
};

export async function executeSecureTextCompletion(
  options: SecureTextCompletionOptions,
): Promise<SecureTextCompletionResult> {
  const vault = new PIIVault();

  try {
    const scrubbedInput = vault.scrubString(options.inputText);
    vault.logAudit("SCRUB", options.endpoint, options.userContext.userId, options.userContext.username);

    const messages = [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: scrubbedInput },
    ] as const;

    const cacheFeature = options.cacheScope
      ? `${options.feature}:${options.cacheScope}`
      : options.feature;
    const cacheKey = generateCacheKey(
      messages.map((message) => ({ role: message.role, content: message.content })),
      options.model,
      cacheFeature,
    );

    let rawWithTokens = "";
    let finishReason: string | null | undefined = null;
    let wasCached = false;

    if (options.useCache !== false) {
      const cached = getCachedResponse(cacheKey);
      if (cached && typeof cached.result === "string" && cached.result.trim().length > 0) {
        rawWithTokens = cached.result;
        wasCached = true;
      }
    }

    if (!rawWithTokens) {
      const response = await createChatCompletionWithLogging(
        {
          model: options.model,
          messages: [...messages],
          temperature: options.temperature ?? 0,
          max_completion_tokens: options.maxCompletionTokens ?? 1200,
          seed: options.seed,
          response_format: options.responseFormat,
        },
        options.feature,
        options.userContext,
      );

      rawWithTokens = response.choices?.[0]?.message?.content?.trim() || "";
      finishReason = response.choices?.[0]?.finish_reason;
      if (!rawWithTokens) {
        throw new Error("AI response did not contain content");
      }

      if (options.useCache !== false) {
        const approxTokensSaved = Math.max(
          1,
          Math.ceil((scrubbedInput.length + rawWithTokens.length + options.systemPrompt.length) / 4),
        );
        setCachedResponse(cacheKey, rawWithTokens, cacheFeature, approxTokensSaved);
      }
    }

    const restoredText = vault.restoreString(rawWithTokens);
    vault.logAudit("RESTORE", options.endpoint, options.userContext.userId, options.userContext.username);

    return {
      restoredText,
      rawWithTokens,
      vaultExport: vault.export(),
      wasCached,
      finishReason,
    };
  } finally {
    vault.clear();
  }
}