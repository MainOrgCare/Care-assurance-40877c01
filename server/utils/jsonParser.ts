/**
 * JSON parsing utilities for extracting structured data from AI responses.
 * Shared between main routes and Copilot API routes.
 */

/**
 * Strip reasoning model `<think>...</think>` blocks from AI responses.
 * DeepSeek R1 and similar chain-of-thought models wrap their internal
 * reasoning in these tags. The reasoning text often contains `{` and `}`
 * characters that break JSON extraction, so it must be removed first.
 */
export function stripReasoningTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Extract the first complete JSON object from a string.
 * Handles cases where AI wraps JSON in markdown code blocks or extra text.
 */
export function extractJsonObject(content: string): string | null {
  // Strip reasoning model <think> blocks before extracting JSON
  let cleaned = stripReasoningTags(content);
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");

  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];
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
        if (depth === 0) return cleaned.slice(start, i + 1);
      }
    }
  }

  // If we ran out of content with unclosed braces, try to close them
  // (handles truncated JSON from token limits)
  if (depth > 0) {
    let truncated = cleaned.slice(start);
    // Remove any trailing incomplete key-value pair
    truncated = truncated.replace(/,\s*"[^"]*"?\s*:?\s*$/, "");
    // Close remaining braces/brackets
    for (let i = 0; i < depth; i++) {
      truncated += "}";
    }
    return truncated;
  }

  return null;
}

/**
 * Parse JSON from AI response content with fallback cleaning.
 * Handles trailing commas, single quotes, comments, and other common AI JSON quirks.
 */
export function parseJsonFromContent(content: string): any | null {
  const jsonText = extractJsonObject(content);
  if (!jsonText) return null;

  // Attempt 1: Parse as-is
  try {
    return JSON.parse(jsonText);
  } catch { /* continue to cleaning */ }

  // Attempt 2: Fix trailing commas
  let cleaned = jsonText.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(cleaned);
  } catch { /* continue to more aggressive cleaning */ }

  // Attempt 3: Remove single-line comments (// ...) outside strings
  cleaned = cleaned.replace(/(?<="[^"]*"[^"]*?)\/\/[^\n]*/g, "");
  // Remove inline comments that appear after values
  cleaned = cleaned.replace(/,?\s*\/\/[^\n]*/g, "");
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Attempt 4: Fix unescaped newlines within string values
  cleaned = cleaned.replace(/(?<=[":]\s*"[^"]*)\n(?=[^"]*")/g, "\\n");
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Attempt 5: Replace smart/curly quotes with straight quotes
  cleaned = cleaned
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  try {
    return JSON.parse(cleaned);
  } catch { /* all attempts failed */ }

  return null;
}

/**
 * Extract an array of JSON objects from AI response content.
 * Useful when the AI returns a JSON array instead of an object.
 */
export function extractJsonArray(content: string): any[] | null {
  let cleaned = stripReasoningTags(content);
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
  const start = cleaned.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escape) { escape = false; continue; }
    if (char === "\\" && inString) { escape = true; continue; }
    if (char === "\"") { inString = !inString; continue; }
    if (!inString) {
      if (char === "[" || char === "{") depth += 1;
      if (char === "]" || char === "}") {
        depth -= 1;
        if (depth === 0 && char === "]") {
          const arrayText = cleaned.slice(start, i + 1).replace(/,\s*([}\]])/g, "$1");
          try {
            return JSON.parse(arrayText);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}
