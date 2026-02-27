import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { executeSecureChatCompletion, executeSecureTextCompletion } from "../utils/secureAiPipeline";

const createMockChatCompletion = (content: string): ChatCompletion => ({
  id: "chatcmpl-test",
  object: "chat.completion",
  created: Math.floor(Date.now() / 1000),
  model: "gpt-4.1-mini",
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      logprobs: null,
      message: {
          role: "assistant",
          content,
          refusal: null
      },
    },
  ],
});

describe("secureAiPipeline", () => {
  it("scrubs outgoing text and restores tokenized response", async () => {
    let capturedParams: { messages?: Array<{ content?: string }> } | null = null;

    const result = await executeSecureTextCompletion({
      endpoint: "/test/secure-text",
      feature: "secure-text-test",
      model: "gpt-4.1-mini",
      userContext: { userId: null, username: null },
      systemPrompt: "You are a test assistant.",
      inputText: "Patient John Smith, email john.smith@example.com",
      useCache: false,
      completionRunner: async (params) => {
        capturedParams = params as { messages?: Array<{ content?: string }> };
        const userMessage = (capturedParams.messages?.[1]?.content ?? "").toString();
        return createMockChatCompletion(`Echo: ${userMessage}`);
      },
    });

    const scrubbedUser = (capturedParams?.messages?.[1]?.content ?? "").toString();
    assert(!scrubbedUser.includes("John Smith"));
    assert(!scrubbedUser.includes("john.smith@example.com"));
    assert(result.restoredText.includes("John Smith"));
    assert(result.restoredText.includes("john.smith@example.com"));
  });

  it("scrubs multipart text but preserves non-text parts", async () => {
    let capturedUserContent: unknown[] = [];

    await executeSecureTextCompletion({
      endpoint: "/test/secure-multipart",
      feature: "secure-multipart-test",
      model: "gpt-4.1-mini",
      userContext: { userId: null, username: null },
      systemPrompt: "Extract data.",
      userContent: [
        { type: "text", text: "Contact: jane.doe@example.com" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AAA", detail: "high" } },
      ],
      useCache: false,
      completionRunner: async (params) => {
        capturedUserContent = ((params.messages as Array<{ content: unknown[] }>)[1]?.content ?? []) as unknown[];
        return createMockChatCompletion("{}");
      },
    });

    const textPart = capturedUserContent[0] as { type?: string; text?: string };
    const imagePart = capturedUserContent[1] as { type?: string; image_url?: { url?: string } };

    assert.equal(textPart.type, "text");
    assert(typeof textPart.text === "string");
    assert(!textPart.text!.includes("jane.doe@example.com"));

    assert.equal(imagePart.type, "image_url");
    assert.equal(imagePart.image_url?.url, "data:image/png;base64,AAA");
  });

  it("scrubs only user-role chat content", async () => {
    const auditCalls: string[] = [];
    const vault = {
      scrubString: (data: string) => data.replaceAll("secret", "{{TOKEN}}"),
      logAudit: (operation: "SCRUB" | "RESTORE") => {
        auditCalls.push(operation);
      },
    };

    let capturedParams: { messages?: Array<{ role: string; content: string }> } | null = null;

    await executeSecureChatCompletion({
      endpoint: "/test/secure-chat",
      feature: "secure-chat-test",
      model: "gpt-4.1-mini",
      userContext: { userId: null, username: null },
      vault,
      messages: [
        { role: "system", content: "system message" },
        { role: "user", content: "my secret value" },
        { role: "assistant", content: "assistant secret should remain" },
      ],
      completionRunner: async (params) => {
        capturedParams = params as { messages?: Array<{ role: string; content: string }> };
        return createMockChatCompletion("ok");
      },
    });

    const sentMessages = capturedParams?.messages ?? [];
    const userMessage = sentMessages.find((m) => m.role === "user")?.content ?? "";
    const assistantMessage = sentMessages.find((m) => m.role === "assistant")?.content ?? "";

    assert(userMessage.includes("{{TOKEN}}"));
    assert(!assistantMessage.includes("{{TOKEN}}"));
    assert.equal(auditCalls[0], "SCRUB");
  });
});
