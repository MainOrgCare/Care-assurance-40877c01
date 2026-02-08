/**
 * JSON parsing utilities for extracting structured data from AI responses.
 * Shared between main routes and Copilot API routes.
 */

/**
 * Extract the first complete JSON object from a string.
 * Handles cases where AI wraps JSON in markdown code blocks or extra text.
 */
export function extractJsonObject(content: string): string | null {
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
}

/**
 * Parse JSON from AI response content with fallback cleaning.
 * Handles trailing commas and other common AI JSON quirks.
 */
export function parseJsonFromContent(content: string): any | null {
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
}
