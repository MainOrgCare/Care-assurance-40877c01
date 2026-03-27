/**
 * Email Assistant & PRN Protocol Routes
 *
 * AI-powered endpoints for rewriting care-related emails with selectable
 * tone and generating PRN (as-needed) medication protocols.
 *
 * @module server/routes/emailAssistant
 */
import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";
import { executeSecureTextCompletion } from "../utils/secureAiPipeline";
import {
  getPreferredModel,
  getUseAICache,
  getAiErrorStatusCode,
  type AiUserContext,
} from "../services/aiClient";

// ── Model helpers ──────────────────────────────────────────────────
const getLowCostModel = () => "gpt-4.1-mini";
const getAccurateModel = () => getPreferredModel();

// ── JSON parsing helpers ───────────────────────────────────────────

const extractJsonObject = (content: string): string | null => {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < content.length; i++) {
    const char = content[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\" && inString) {
      escape = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return content.slice(start, i + 1);
      }
    }
  }
  return null;
};

const parseJsonFromContent = (content: string): any | null => {
  const jsonText = extractJsonObject(content);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    const cleaned = jsonText.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
};

const coerceProtocolText = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceProtocolText(item))
      .filter(Boolean)
      .join("; ")
      .trim();
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const preferredKeys = ["text", "value", "description", "content", "label", "name"];
    for (const key of preferredKeys) {
      const extracted = coerceProtocolText(objectValue[key]);
      if (extracted) return extracted;
    }
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const normalizePrnProtocol = (rawProtocol: any, medicationName: string) => {
  const source = rawProtocol && typeof rawProtocol === "object" ? rawProtocol : {};
  const getAny = (...keys: string[]) => {
    for (const key of keys) {
      const value = coerceProtocolText((source as Record<string, unknown>)[key]);
      if (value) return value;
    }
    return "";
  };

  return {
    medicationName:
      getAny("medicationName", "medication", "name") || medicationName,
    dose:
      getAny("dose", "recommendedDose", "dosage") ||
      "Follow MAR chart and prescriber instructions.",
    route:
      getAny("route", "administrationRoute") ||
      "Follow MAR chart and prescriber instructions.",
    frequency:
      getAny("frequency", "administrationFrequency") ||
      "Administer only when clinically indicated and as prescribed.",
    maxDoseIn24Hours:
      getAny("maxDoseIn24Hours", "maxDose24Hours", "maximumDoseIn24Hours") ||
      "Do not exceed prescribed 24-hour maximum on the MAR chart.",
    minimumTimeBetweenDoses:
      getAny("minimumTimeBetweenDoses", "minimumInterval", "minimumTimeBetweenAdministrations") ||
      "Observe the minimum interval stated on the MAR chart.",
    specialInstructions:
      getAny("specialInstructions", "instructions", "administrationInstructions") ||
      "Check indication, allergies, recent administrations, and document rationale before/after administration.",
    reasonsForAdministration:
      getAny("reasonsForAdministration", "indications", "reasons", "whenToGive") ||
      "Only administer for prescribed indications; verify symptoms and care plan guidance before giving.",
    predictableSideEffects:
      getAny("predictableSideEffects", "sideEffects", "commonSideEffects") ||
      "Monitor for expected side effects per medication guidance and escalate concerns promptly.",
    additionalComments:
      getAny("additionalComments", "comments", "notes") ||
      "If unsure, do not administer and seek senior/clinical advice. Record all decisions in care notes.",
  };
};

// ── Route deps ─────────────────────────────────────────────────────

export interface EmailAssistantRouteDeps {
  requireAuth: RequestHandler;
}

export function registerEmailAssistantRoutes(
  app: Express,
  { requireAuth }: EmailAssistantRouteDeps,
): void {
  // Rewrite email with tone selection
  app.post("/api/ai/rewrite-email", requireAuth, async (req: any, res) => {
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };

    try {
      const { inputText, tone } = req.body;

      if (!inputText || !tone) {
        return res.status(400).json({ message: "Input text and tone are required" });
      }

      const toneInstructions: Record<string, string> = {
        professional: `Write in a formal, professional tone. Use proper business language, be courteous and respectful. Structure with proper greeting, clear paragraphs, and professional closing. Avoid casual language or contractions.`,
        direct: `Write in a clear, concise, and to-the-point style. Get straight to the business matter. Be brief but not rude. Use short sentences and clear action items. Minimize pleasantries but remain polite.`,
        empathetic: `Write in a warm, understanding, and supportive tone. Show genuine care for the recipient's situation. Use friendly language while remaining professional. Acknowledge their efforts and offer help. Be encouraging and positive.`,
        formal: `Write in a highly formal, official tone suitable for regulatory correspondence, board communications, or legal matters. Use complete sentences, avoid abbreviations, and maintain a ceremonial register. Include proper salutations and formal closings.`,
        urgent: `Write with a sense of urgency and importance. Use clear, action-oriented language. Highlight time-sensitive elements. Be direct about deadlines and required actions. Use bold formatting cues like 'URGENT:' or 'ACTION REQUIRED:' where appropriate. Maintain professionalism despite the urgency.`,
      };

      const { generateSubject } = req.body;

      const subjectInstruction = generateSubject !== false
        ? `\n9. Start the email with a "Subject: [appropriate subject line]" on the first line, followed by a blank line, then the email body.`
        : "";

      const systemPrompt = `You are an expert email writer for UK care facilities. Your task is to take rough notes, bullet points, or draft text and transform it into a polished, well-structured email.

TONE: ${tone.toUpperCase()}
${toneInstructions[tone] || toneInstructions.professional}

RULES:
1. Transform the user's rough input into a complete, polished email
2. Keep the core message and intent from the user's input
3. Add appropriate greeting and sign-off
4. Use UK English spelling (e.g., "organise" not "organize")
5. Keep it concise but complete
6. If the input mentions specific people, dates, or details, include them
7. Format with proper paragraphs for readability
8. Use [Recipient Name] and [Your Name] as placeholders${subjectInstruction}

Return ONLY the email text, nothing else.`;

      const response = await executeSecureTextCompletion({
        endpoint: "/api/ai/rewrite-email",
        feature: "email_assistant",
        model: getLowCostModel(),
        userContext: aiUserContext,
        inputText,
        systemPrompt,
        maxCompletionTokens: 1000,
        temperature: 0.2,
        seed: 42,
        useCache: getUseAICache(),
        cacheScope: `${tone}`,
      });

      if (!response.restoredText) {
        return res.status(500).json({ message: "Failed to generate email" });
      }

      return res.json({ rewrittenEmail: response.restoredText });
    } catch (error: unknown) {
      console.error("Email rewrite error:", error);
      return res.status(getAiErrorStatusCode(error)).json({ message: safeErrorMessage(error, "Failed to rewrite email") });
    }
  });

  // Generate PRN medication protocol
  app.post("/api/ai/generate-prn-protocol", requireAuth, async (req: any, res) => {
    const aiUserContext: AiUserContext = { userId: req.user?.id || null, username: req.user?.username || null };

    try {
      const { medicationName, existingData } = req.body;

      if (!medicationName) {
        return res.status(400).json({ message: "Medication name is required" });
      }

      const systemPrompt = `You are an expert UK care facility medication protocol writer. Generate a comprehensive PRN (Pro Re Nata / "as needed") medication protocol for use in a care home setting.

The protocol must follow UK care standards and regulations. Generate a complete, professional protocol that care workers can follow.

IMPORTANT: Return the response as a JSON object with the following exact structure:
{
  "medicationName": "Name of the medication",
  "dose": "Recommended dosage (e.g., '500mg', '1-2 tablets')",
  "route": "Route of administration (e.g., 'Oral', 'Topical', 'Sublingual')",
  "frequency": "How often it can be given (e.g., 'Up to 4 times daily as needed')",
  "maxDoseIn24Hours": "Maximum allowed in 24 hours (e.g., '4g (8 x 500mg tablets)')",
  "minimumTimeBetweenDoses": "Minimum gap between doses (e.g., '4 hours')",
  "specialInstructions": "Any special instructions for administration",
  "reasonsForAdministration": "List of symptoms/reasons when this medication should be given",
  "predictableSideEffects": "Common side effects to monitor for",
  "additionalComments": "Any other relevant information for care workers"
}

Use UK English spelling. Be specific and clinically accurate. If the medication is commonly used in care settings, use standard clinical guidelines for dosing.`;

      const userPrompt = existingData
        ? `Generate a complete PRN protocol for: ${medicationName}\n\nExisting information available:\n${JSON.stringify(existingData, null, 2)}\n\nPlease enhance and complete this protocol with all required fields.`
        : `Generate a complete PRN protocol for: ${medicationName}`;

      const response = await executeSecureTextCompletion({
        endpoint: "/api/ai/generate-prn-protocol",
        feature: "prn_protocol",
        model: getAccurateModel(),
        userContext: aiUserContext,
        inputText: userPrompt,
        systemPrompt,
        maxCompletionTokens: 1500,
        temperature: 0,
        seed: 42,
        responseFormat: { type: "json_object" },
        useCache: getUseAICache(),
        cacheScope: medicationName.toLowerCase().trim(),
      });

      const content = response.restoredText || "";

      if (!content) {
        return res.status(500).json({ message: "Failed to generate PRN protocol" });
      }

      const parsedProtocol = parseJsonFromContent(content);
      if (!parsedProtocol) {
        console.warn("PRN protocol response was not valid JSON; returning normalized fallback protocol");
      }

      const protocol = normalizePrnProtocol(parsedProtocol || { additionalComments: content }, medicationName);
      return res.json({ protocol });
    } catch (error: unknown) {
      console.error("PRN protocol generation error:", error);
      return res.status(getAiErrorStatusCode(error)).json({ message: safeErrorMessage(error, "Failed to generate PRN protocol") });
    }
  });
}
