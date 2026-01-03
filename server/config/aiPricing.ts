// AI model pricing in micro-dollars per 1000 tokens
// 1 micro-dollar = $0.000001, so 1000 micro-dollars = $0.001
// Updated January 2026 with accurate OpenAI pricing

export const AI_PRICING: Record<string, { input: number; output: number }> = {
  // GPT-5.1 - $5.00/1M input, $15.00/1M output (flagship model)
  "gpt-5.1": { input: 5000, output: 15000 },
  
  // GPT-5 - $1.25/1M input, $10.00/1M output
  "gpt-5": { input: 1250, output: 10000 },
  "gpt-5-2025-08-07": { input: 1250, output: 10000 },
  
  // GPT-5-mini - $0.25/1M input, $2.00/1M output (cost-efficient)
  "gpt-5-mini": { input: 250, output: 2000 },
  "gpt-5-mini-2025-08-07": { input: 250, output: 2000 },
  
  // GPT-5.2 - $1.75/1M input, $14.00/1M output (coding/agentic)
  "gpt-5.2": { input: 1750, output: 14000 },
  
  // GPT-4o models - $2.50/1M input, $10/1M output
  "gpt-4o": { input: 2500, output: 10000 },
  "gpt-4o-2024-11-20": { input: 2500, output: 10000 },
  "gpt-4o-2024-08-06": { input: 2500, output: 10000 },
  
  // GPT-4o-mini - $0.15/1M input, $0.60/1M output
  "gpt-4o-mini": { input: 150, output: 600 },
  "gpt-4o-mini-2024-07-18": { input: 150, output: 600 },
  
  // GPT-4-turbo
  "gpt-4-turbo": { input: 10000, output: 30000 },
  "gpt-4-turbo-preview": { input: 10000, output: 30000 },
  
  // GPT-3.5-turbo
  "gpt-3.5-turbo": { input: 500, output: 1500 },
  "gpt-3.5-turbo-0125": { input: 500, output: 1500 },
  
  // Default fallback (uses gpt-4o rates)
  "default": { input: 2500, output: 10000 },
};

// Available models for admin selection
// Note: Only includes models that support temperature parameter (required for deterministic EMAR analysis)
// Reasoning models like gpt-5-mini/o1-series are excluded as they don't support temperature
export const AVAILABLE_MODELS = [
  { id: "gpt-5.1", name: "GPT-5.1", description: "Flagship model - best quality", inputCost: "$5.00/1M", outputCost: "$15.00/1M" },
  { id: "gpt-4o", name: "GPT-4o", description: "Balanced performance", inputCost: "$2.50/1M", outputCost: "$10.00/1M" },
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
