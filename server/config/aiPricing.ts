// AI model pricing in micro-dollars per 1000 tokens
// 1 micro-dollar = $0.000001, so 1000 micro-dollars = $0.001
// Updated January 2026 with OpenAI Standard tier pricing from platform.openai.com/docs/pricing

export const AI_PRICING: Record<string, { input: number; output: number }> = {
  // GPT-5.2 - $1.75/1M input, $14.00/1M output (coding/agentic)
  "gpt-5.2": { input: 1750, output: 14000 },
  
  // GPT-5 - $1.25/1M input, $10.00/1M output
  "gpt-5": { input: 1250, output: 10000 },
  "gpt-5-chat-latest": { input: 1250, output: 10000 },
  "gpt-5-codex": { input: 1250, output: 10000 },
  
  // GPT-5-mini - $0.25/1M input, $2.00/1M output (cost-efficient)
  "gpt-5-mini": { input: 250, output: 2000 },
  
  // GPT-5-nano - $0.05/1M input, $0.40/1M output (ultra-efficient)
  "gpt-5-nano": { input: 50, output: 400 },
  
  // GPT-4.1 - $2.00/1M input, $8.00/1M output
  "gpt-4.1": { input: 2000, output: 8000 },
  "gpt-4.1-2026-04-14": { input: 2000, output: 8000 },
  
  // GPT-4.1-mini - $0.40/1M input, $1.60/1M output
  "gpt-4.1-mini": { input: 400, output: 1600 },
  "gpt-4.1-mini-2026-04-14": { input: 400, output: 1600 },
  
  // GPT-4.1-nano - $0.10/1M input, $0.40/1M output
  "gpt-4.1-nano": { input: 100, output: 400 },
  "gpt-4.1-nano-2026-04-14": { input: 100, output: 400 },
  
  // GPT-4o models - $2.50/1M input, $10.00/1M output
  "gpt-4o": { input: 2500, output: 10000 },
  "gpt-4o-2024-11-20": { input: 2500, output: 10000 },
  "gpt-4o-2024-08-06": { input: 2500, output: 10000 },
  
  // GPT-4o-mini - $0.15/1M input, $0.60/1M output
  "gpt-4o-mini": { input: 150, output: 600 },
  "gpt-4o-mini-2024-07-18": { input: 150, output: 600 },
  
  // O-series reasoning models
  "o1": { input: 15000, output: 60000 },
  "o1-mini": { input: 1100, output: 4400 },
  "o3": { input: 2000, output: 8000 },
  "o3-mini": { input: 1100, output: 4400 },
  "o4-mini": { input: 1100, output: 4400 },
  
  // GPT-4-turbo (legacy) - $10.00/1M input, $30.00/1M output
  "gpt-4-turbo": { input: 10000, output: 30000 },
  "gpt-4-turbo-2024-04-09": { input: 10000, output: 30000 },
  "gpt-4-turbo-preview": { input: 10000, output: 30000 },
  
  // GPT-3.5-turbo (legacy) - $0.50/1M input, $1.50/1M output
  "gpt-3.5-turbo": { input: 500, output: 1500 },
  "gpt-3.5-turbo-0125": { input: 500, output: 1500 },
  
  // Local LLM models (no API cost - self-hosted)
  "phi3:mini": { input: 0, output: 0 },
  "phi3:mini-4k-instruct-q4_K_M": { input: 0, output: 0 },
  "local": { input: 0, output: 0 },
  
  // Default fallback (uses gpt-4o rates)
  "default": { input: 2500, output: 10000 },
};

// Available models for admin selection
// Note: Only includes models that support temperature parameter (required for deterministic EMAR analysis)
// Reasoning models like o1/o3/o4-series are excluded as they don't support temperature
export const AVAILABLE_MODELS = [
  { id: "gpt-5.2", name: "GPT-5.2", description: "Coding/agentic - most capable", inputCost: "$1.75/1M", outputCost: "$14.00/1M" },
  { id: "gpt-5", name: "GPT-5", description: "High quality", inputCost: "$1.25/1M", outputCost: "$10.00/1M" },
  { id: "gpt-4.1", name: "GPT-4.1", description: "Balanced performance", inputCost: "$2.00/1M", outputCost: "$8.00/1M" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", description: "Cost-efficient", inputCost: "$0.40/1M", outputCost: "$1.60/1M" },
  { id: "gpt-4o", name: "GPT-4o", description: "Legacy balanced", inputCost: "$2.50/1M", outputCost: "$10.00/1M" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Budget option", inputCost: "$0.15/1M", outputCost: "$0.60/1M" },
] as const;

export type AvailableModel = typeof AVAILABLE_MODELS[number]["id"];

export function calculateCostMicroDollars(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = AI_PRICING[model] || AI_PRICING["default"];
  
  // Cost per 1000 tokens in micro-dollars
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  
  return Math.round(inputCost + outputCost);
}

export function formatCostDisplay(microDollars: number): string {
  const dollars = microDollars / 1000000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  } else if (dollars < 1) {
    return `$${dollars.toFixed(3)}`;
  } else {
    return `$${dollars.toFixed(2)}`;
  }
}
