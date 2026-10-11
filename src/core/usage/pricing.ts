// Pricing rates for AI models in $/1M tokens

export interface ModelPricingRates {
  input: number;
  output: number;
  cached: number;
  reasoning?: number;
  cache_creation?: number;
}

export const ZERO_PRICING: ModelPricingRates = {
  input: 0,
  output: 0,
  cached: 0,
  reasoning: 0,
  cache_creation: 0,
};

export const FREE_MODEL_NAMESPACES = ["cline-free/", "free/", "local/"];

export function isFreeModel(model?: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return FREE_MODEL_NAMESPACES.some((ns) => lower.startsWith(ns));
}

export const MODEL_PRICING: Record<string, ModelPricingRates> = {
  // === Anthropic / Claude ===
  "claude-opus-4-6":              { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  },
  "claude-opus-4-5-20251101":     { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  },
  "claude-sonnet-4-6":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-sonnet-4-5-20250929":   { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-haiku-4-5-20251001":    { input: 1.00,  output: 5.00,  cached: 0.10,  reasoning: 5.00,   cache_creation: 1.25  },
  "claude-sonnet-4-20250514":     { input: 3.00,  output: 15.00, cached: 1.50,  reasoning: 15.00,  cache_creation: 3.00  },
  "claude-opus-4-20250514":       { input: 15.00, output: 25.00, cached: 7.50,  reasoning: 112.50, cache_creation: 15.00 },
  "claude-3-7-sonnet-20250219":   { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-3-7-sonnet":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-3-5-sonnet":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "anthropic/claude-3-7-sonnet":  { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "anthropic/claude-3-5-sonnet":  { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-3-5-sonnet-20241022":   { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-3-5-sonnet-20240620":   { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-3-5-haiku-20241022":    { input: 0.80,  output: 4.00,  cached: 0.08,  reasoning: 4.00,   cache_creation: 1.00  },
  "claude-haiku-4.5":             { input: 0.50,  output: 2.50,  cached: 0.05,  reasoning: 3.75,   cache_creation: 0.50  },
  "claude-opus-4.1":              { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-opus-4.5":              { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-sonnet-4":              { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },
  "claude-sonnet-4.5":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },
  "claude-sonnet-4.6":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },

  // === OpenAI / GPT ===
  "gpt-4o":                       { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "openai/gpt-4o":                { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-4o-mini":                  { input: 0.15,  output: 0.60,  cached: 0.075, reasoning: 0.90,   cache_creation: 0.15  },
  "gpt-4.1":                      { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-5":                        { input: 1.25,  output: 10.00, cached: 0.625, reasoning: 10.00,  cache_creation: 1.25  },
  "gpt-5-mini":                   { input: 0.25,  output: 2.00,  cached: 0.125, reasoning: 2.00,   cache_creation: 0.25  },
  "gpt-5-codex":                  { input: 1.25,  output: 10.00, cached: 0.625, reasoning: 10.00,  cache_creation: 1.25  },
  "gpt-5.1-codex":                { input: 1.25,  output: 10.00, cached: 0.625, reasoning: 10.00,  cache_creation: 1.25  },
  "gpt-5.1-codex-mini":           { input: 1.50,  output: 6.00,  cached: 0.75,  reasoning: 9.00,   cache_creation: 1.50  },
  "gpt-5.2-codex":                { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  },
  "gpt-5.3-codex":                { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  },
  "gpt-5.3-codex-spark":         { input: 3.00,  output: 12.00, cached: 0.30,  reasoning: 12.00,  cache_creation: 3.00  },
  "gpt-5.6":                      { input: 2.50,  output: 15.00, cached: 0.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-5.6-luna":                 { input: 1.00,  output: 6.00,  cached: 0.10,  reasoning: 6.00,   cache_creation: 1.00  },
  "gpt-5.6-terra":                { input: 2.50,  output: 15.00, cached: 0.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-5.6-sol":                  { input: 5.00,  output: 30.00, cached: 0.50,  reasoning: 30.00,  cache_creation: 5.00  },
  "o1":                           { input: 15.00, output: 60.00, cached: 7.50,  reasoning: 90.00,  cache_creation: 15.00 },
  "o1-mini":                      { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  },
  "o3-mini":                      { input: 1.10,  output: 4.40,  cached: 0.55,  reasoning: 4.40,   cache_creation: 1.10  },
  "openai/o3-mini":               { input: 1.10,  output: 4.40,  cached: 0.55,  reasoning: 4.40,   cache_creation: 1.10  },

  // === Google / Gemini ===
  "gemini-2.5-pro":               { input: 2.00,  output: 12.00, cached: 0.25,  reasoning: 18.00,  cache_creation: 2.00  },
  "google/gemini-2.5-pro":        { input: 2.00,  output: 12.00, cached: 0.25,  reasoning: 18.00,  cache_creation: 2.00  },
  "gemini-2.5-flash":             { input: 0.15,  output: 0.60,  cached: 0.0375, reasoning: 0.60,  cache_creation: 0.15  },
  "google/gemini-2.5-flash":      { input: 0.15,  output: 0.60,  cached: 0.0375, reasoning: 0.60,  cache_creation: 0.15  },
  "gemini-3-flash":               { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  },
  "gemini-3-pro":                 { input: 2.00,  output: 12.00, cached: 0.25,  reasoning: 18.00,  cache_creation: 2.00  },
  "gemini-3.7-flash":              { input: 1.50,  output: 7.50,  cached: 0.15,  reasoning: 11.25,  cache_creation: 1.875 },
  "gemini-3.8-flash":              { input: 1.50,  output: 7.50,  cached: 0.15,  reasoning: 11.25,  cache_creation: 1.875 },

  // === DeepSeek ===
  "deepseek-chat":                { input: 0.14,  output: 0.28,  cached: 0.014, reasoning: 0.28,   cache_creation: 0.14  },
  "deepseek-reasoner":            { input: 0.55,  output: 2.19,  cached: 0.14,  reasoning: 2.19,   cache_creation: 0.55  },
  "deepseek-r1":                  { input: 0.55,  output: 2.19,  cached: 0.14,  reasoning: 2.19,   cache_creation: 0.55  },
  "deepseek/deepseek-r1":         { input: 0.55,  output: 2.19,  cached: 0.14,  reasoning: 2.19,   cache_creation: 0.55  },
  "deepseek-v3":                  { input: 0.14,  output: 0.28,  cached: 0.014, reasoning: 0.28,   cache_creation: 0.14  },
  "deepseek/deepseek-v3":         { input: 0.14,  output: 0.28,  cached: 0.014, reasoning: 0.28,   cache_creation: 0.14  },

  // === Qwen ===
  "qwen-2.5-coder-32b":           { input: 0.07,  output: 0.20,  cached: 0.01,  reasoning: 0.20,   cache_creation: 0.07  },
  "qwen-plus":                    { input: 0.40,  output: 1.20,  cached: 0.10,  reasoning: 1.20,   cache_creation: 0.40  },
  "qwen-max":                     { input: 1.60,  output: 6.40,  cached: 0.40,  reasoning: 6.40,   cache_creation: 1.60  },
};

export const PATTERN_PRICING: Array<{ pattern: RegExp; pricing: ModelPricingRates }> = [
  { pattern: /codex/i,            pricing: { input: 1.75,  output: 14.00, cached: 0.175, reasoning: 14.00,  cache_creation: 1.75  } },
  { pattern: /claude-.*opus/i,    pricing: { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  } },
  { pattern: /claude-.*sonnet/i,  pricing: { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  } },
  { pattern: /claude-.*haiku/i,   pricing: { input: 0.80,  output: 4.00,  cached: 0.08,  reasoning: 4.00,   cache_creation: 1.00  } },
  { pattern: /claude/i,           pricing: { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  } },
  { pattern: /gemini-.*flash/i,   pricing: { input: 0.30,  output: 2.50,  cached: 0.03,  reasoning: 3.75,   cache_creation: 0.30  } },
  { pattern: /gemini-.*pro/i,     pricing: { input: 2.00,  output: 12.00, cached: 0.25,  reasoning: 18.00,  cache_creation: 2.00  } },
  { pattern: /gemini/i,           pricing: { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  } },
  { pattern: /deepseek.*reason/i, pricing: { input: 0.55,  output: 2.19,  cached: 0.14,  reasoning: 2.19,   cache_creation: 0.55  } },
  { pattern: /deepseek/i,         pricing: { input: 0.14,  output: 0.28,  cached: 0.014, reasoning: 0.28,   cache_creation: 0.14  } },
  { pattern: /gpt-4o/i,           pricing: { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  } },
  { pattern: /gpt-5/i,            pricing: { input: 1.25,  output: 10.00, cached: 0.625, reasoning: 10.00,  cache_creation: 1.25  } },
  { pattern: /gpt-4/i,            pricing: { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  } },
  { pattern: /o1/i,               pricing: { input: 15.00, output: 60.00, cached: 7.50,  reasoning: 90.00,  cache_creation: 15.00 } },
  { pattern: /o3/i,               pricing: { input: 1.10,  output: 4.40,  cached: 0.55,  reasoning: 4.40,   cache_creation: 1.10  } },
  { pattern: /qwen/i,             pricing: { input: 0.40,  output: 1.20,  cached: 0.10,  reasoning: 1.20,   cache_creation: 0.40  } },
];

export function getPricingForModel(provider?: string, model?: string): ModelPricingRates | null {
  if (!model) return null;
  if (isFreeModel(model)) return ZERO_PRICING;

  const cleanModel = model.includes("/") ? model.split("/").pop()! : model;

  if (MODEL_PRICING[cleanModel]) return MODEL_PRICING[cleanModel];
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  for (const { pattern, pricing } of PATTERN_PRICING) {
    if (pattern.test(cleanModel) || pattern.test(model)) {
      return pricing;
    }
  }

  // Default fallback for unknown model: reasonable standard rate
  return { input: 1.00, output: 4.00, cached: 0.20, cache_creation: 1.00 };
}

export function calculateCostFromTokens(
  tokens: {
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
    cacheCreationTokens?: number;
    reasoningTokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    cached_tokens?: number;
    cache_creation_input_tokens?: number;
    reasoning_tokens?: number;
  },
  model?: string,
  provider?: string
): number {
  if (!tokens) return 0;
  const pricing = getPricingForModel(provider, model);
  if (!pricing) return 0;

  const inputTokens = tokens.promptTokens ?? tokens.prompt_tokens ?? 0;
  const cachedTokens = tokens.cachedTokens ?? tokens.cached_tokens ?? 0;
  const cacheCreationTokens = tokens.cacheCreationTokens ?? tokens.cache_creation_input_tokens ?? 0;
  const outputTokens = tokens.completionTokens ?? tokens.completion_tokens ?? 0;
  const reasoningTokens = tokens.reasoningTokens ?? tokens.reasoning_tokens ?? 0;

  // promptTokens is cache-inclusive; subtract cached and cacheCreation tokens to avoid double billing
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens - cacheCreationTokens);

  let cost = 0;
  cost += nonCachedInput * (pricing.input / 1_000_000);
  if (cachedTokens > 0) {
    cost += cachedTokens * (pricing.cached / 1_000_000);
  }
  if (cacheCreationTokens > 0) {
    cost += cacheCreationTokens * ((pricing.cache_creation ?? pricing.input) / 1_000_000);
  }
  cost += outputTokens * (pricing.output / 1_000_000);
  if (reasoningTokens > 0) {
    cost += reasoningTokens * ((pricing.reasoning ?? pricing.output) / 1_000_000);
  }

  return Number(cost.toFixed(6));
}

export function formatCost(cost: number): string {
  if (!cost || isNaN(cost) || cost < 0) return "$0.00";
  if (cost < 0.01 && cost > 0) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}
