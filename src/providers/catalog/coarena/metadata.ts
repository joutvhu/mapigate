import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "coarena",
  name: "Coarena",
  alias: "coarena",
  aliases: ["coarena", "coasty"],
  uiAlias: "coarena",
  color: "#18181B",
  iconBg: "#ffffff",
  image: "/assets/providers/coarena/icon.svg",
  website: "https://coarena.ai",
  notice: {
    apiKeyUrl: "https://coarena.ai/account/api",
    text: "Free daily $5 allowance on frontier & arena models for AI agents. Note: Requests may be used for evaluation benchmarks.",
  },
  category: "freeTier",
  authType: "api-key",
  authModes: ["apikey"],
  baseUrl: "https://coarena.ai/api/v1",
  baseUrls: ["https://coarena.ai/api/v1"],
  validateUrl: "https://coarena.ai/api/v1/limits",
  modelsUrl: "https://coarena.ai/api/v1/models",
  format: "openai",
  supportedFormats: [
    { value: "openai", label: "OpenAI (/chat/completions)" },
    { value: "responses", label: "OpenAI Responses (/responses)" },
    { value: "claude", label: "Anthropic (/messages)" },
  ],
  defaultHeaders: {
    "Content-Type": "application/json",
  },
  thinkingMode: "auto",
  freeTier: {
    scope: "all",
    limitType: "credits",
    note: "Free daily $5 allowance on arena models",
  },
  models: [
    {
      id: "deepseek-v4-1-flash-1017",
      name: "DeepSeek V4.1 Flash 1017",
      isDefault: true,
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "gpt-6-1-sol",
      name: "GPT-6.1 Sol",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "gpt-6-1-terra",
      name: "GPT-6.1 Terra",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "gpt-6-astra",
      name: "GPT-6 Astra",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "gpt-6-luna",
      name: "GPT-6 Luna",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "gemini-4-argon",
      name: "Gemini 4 Argon",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "gemini-4-carbon",
      name: "Gemini 4 Carbon",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "gemini-3-8-flash",
      name: "Gemini 3.8 Flash",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "grok-4-7",
      name: "Grok 4.7",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
    {
      id: "kimi-k3-1-pro",
      name: "Kimi K3.1 Pro",
      capabilities: ["tools", "vision", "reasoning"],
      contextLength: 128000,
    },
  ],
  quotaOrder: [
    "Daily Allowance ($ USD)",
    "Rate Limit (RPM)",
    "Requests Today",
    "Concurrency",
  ],
  passthroughModels: true,
};

export const provider = metadata;
export default metadata;
