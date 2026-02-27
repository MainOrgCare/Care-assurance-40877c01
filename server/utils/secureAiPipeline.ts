import { createChatCompletionWithLogging, type AiUserContext } from "../services/aiClient";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "../services/aiCache";
import { PIIVault } from "./piiVault";
import OpenAI from "openai";

type CompletionRunner = (
  params: Record<string, unknown>,
  feature: string,
  userContext: AiUserContext,
) => Promise<OpenAI.ChatCompletion>;

type SecureTextCompletionOptions = {
  endpoint: string;
  feature: string;
  model: string;
  userContext: AiUserContext;
  inputText?: string;
  userContent?: string | unknown[];
  systemPrompt: string;
  temperature?: number;
  maxCompletionTokens?: number;
  seed?: number;
  responseFormat?: { type: "json_object" };
  useCache?: boolean;
  cacheScope?: string;
  completionRunner?: CompletionRunner;
};

type VaultLike = {
  scrubString: (data: string) => string;
  logAudit: (
    operation: "SCRUB" | "RESTORE",
    endpoint: string,
    userId?: number | string | null,
    username?: string | null,
  ) => void;
};

type SecureTextCompletionResult = {
  restoredText: string;
  rawWithTokens: string;
  vaultExport: ReturnType<PIIVault["export"]>;
  wasCached: boolean;
  finishReason?: string | null;
};

function scrubUserContent(vault: VaultLike, content: string | unknown[]): string | unknown[] {
  if (typeof content === "string") {
    return vault.scrubString(content);
  }

  return content.map((item) => {
    if (!item || typeof item !== "object") return item;
    if (!("type" in item) || !("text" in item)) return item;

    const typed = item as { type?: unknown; text?: unknown };
    if (typed.type !== "text" || typeof typed.text !== "string") {
      return item;
    }

    return {
      ...(item as Record<string, unknown>),
      text: vault.scrubString(typed.text),
    };
  });
}

export async function executeSecureTextCompletion(
  options: SecureTextCompletionOptions,
): Promise<SecureTextCompletionResult> {
  const vault = new PIIVault();

  try {
    const rawInput = options.userContent ?? options.inputText;
    if (rawInput == null) {
      throw new Error("Secure completion requires either inputText or userContent");
    }
    const scrubbedInput = scrubUserContent(vault, rawInput);
    vault.logAudit("SCRUB", options.endpoint, options.userContext.userId, options.userContext.username);

    const messages = [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: scrubbedInput },
    ] as const;

    const cacheFeature = options.cacheScope
      ? `${options.feature}:${options.cacheScope}`
      : options.feature;
    const canUseCache = options.useCache !== false && typeof scrubbedInput === "string";
    const cacheKey = canUseCache
      ? generateCacheKey(
          messages.map((message) => ({ role: message.role, content: String(message.content) })),
          options.model,
          cacheFeature,
        )
      : null;

    let rawWithTokens = "";
    let finishReason: string | null | undefined = null;
    let wasCached = false;

    if (canUseCache) {
      const cached = cacheKey ? getCachedResponse(cacheKey) : null;
      if (cached && typeof cached.result === "string" && cached.result.trim().length > 0) {
        rawWithTokens = cached.result;
        wasCached = true;
      }
    }

    if (!rawWithTokens) {
      const response = await (options.completionRunner ?? createChatCompletionWithLogging)(
        {
          model: options.model,
          messages: [...messages] as any,
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

      if (canUseCache) {
        const approxTokensSaved = Math.max(
          1,
          Math.ceil((scrubbedInput.length + rawWithTokens.length + options.systemPrompt.length) / 4),
        );
        if (cacheKey) {
          setCachedResponse(cacheKey, rawWithTokens, cacheFeature, approxTokensSaved);
        }
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

type SecureChatCompletionOptions = {
  endpoint: string;
  feature: string;
  model: string;
  userContext: AiUserContext;
  vault: VaultLike;
  messages: Array<{ role: string; content: unknown; [key: string]: unknown }>;
  tools?: unknown[];
  temperature?: number;
  maxCompletionTokens?: number;
  seed?: number;
  completionRunner?: CompletionRunner;
};

export async function executeSecureChatCompletion(
  options: SecureChatCompletionOptions,
) {
  const completionRunner = options.completionRunner ?? createChatCompletionWithLogging;
  const scrubbedMessages = options.messages.map((message) => {
    if (message.role !== "user") {
      return message;
    }

    if (typeof message.content === "string" || Array.isArray(message.content)) {
      return {
        ...message,
        content: scrubUserContent(options.vault, message.content),
      };
    }

    return message;
  });

  options.vault.logAudit("SCRUB", options.endpoint, options.userContext.userId, options.userContext.username);

  return completionRunner(
    {
      model: options.model,
      messages: scrubbedMessages as any,
      tools: options.tools as any,
      temperature: options.temperature ?? 0,
      max_completion_tokens: options.maxCompletionTokens ?? 800,
      seed: options.seed,
    },
    options.feature,
    options.userContext,
  );
}