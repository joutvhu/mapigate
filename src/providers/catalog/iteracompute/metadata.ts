import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "iteracompute",
  name: "IteraCompute",
  alias: "iteracompute",
  aliases: ["iteracompute", "itera"],
  uiAlias: "itera",
  color: "#6366F1",
  iconBg: "#ffffff",
  image: "/assets/providers/iteracompute/icon.svg",
  website: "https://platform.iteracompute.com",
  notice: {
    apiKeyUrl: "https://platform.iteracompute.com",
    text: "OpenAI-compatible gateway with 30M free monthly tokens (160k TPM) for Auto, Qwen, DeepSeek, and GLM models. Documentation: https://platform.iteracompute.com/docs.html"
  },
  category: "freeTier",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://api.iteracompute.com/v1",
  baseUrls: ["https://api.iteracompute.com/v1"],
  modelsUrl: "https://api.iteracompute.com/v1/models",
  validateUrl: "https://api.iteracompute.com/v1/models",
  format: "openai",
  defaultHeaders: {
    "Content-Type": "application/json"
  },
  thinkingMode: "auto",
  models: [
    {
      id: "Auto",
      name: "Auto (Free 30M/mo)",
      isDefault: true,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 262144
    },
    {
      id: "qwen/qwen3.8-27b",
      name: "Qwen 3.8 27B",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 262144
    },
    {
      id: "deepseek/deepseek-v4.1-flash",
      name: "DeepSeek V4.1 Flash",
      isDefault: false,
      capabilities: ["tools", "reasoning"],
      contextLength: 1048576
    },
    {
      id: "deepseek/deepseek-v4.1-flash-1017",
      name: "DeepSeek V4.1 Flash 1017",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1048576
    },
    {
      id: "deepseek/deepseek-v4-pro-0813",
      name: "DeepSeek V4 Pro 0813",
      isDefault: false,
      capabilities: ["tools", "reasoning"],
      contextLength: 1048576
    },
    {
      id: "z-ai/glm-5.3-flash",
      name: "GLM 5.3 Flash",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1048576
    },
    {
      id: "z-ai/glm-5.3",
      name: "GLM 5.3",
      isDefault: false,
      capabilities: ["tools", "reasoning"],
      contextLength: 1048576
    },
    {
      id: "z-ai/glm-5.2",
      name: "GLM 5.2",
      isDefault: false,
      capabilities: ["tools", "reasoning"],
      contextLength: 1048576
    },
    {
      id: "moonshotai/kimi-k2.5",
      name: "Kimi K2.5",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 262144
    },
    {
      id: "moonshotai/kimi-k2.6",
      name: "Kimi K2.6",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 262144
    },
    {
      id: "moonshotai/kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      isDefault: false,
      capabilities: ["tools", "reasoning"],
      contextLength: 262144
    },
    {
      id: "moonshotai/kimi-k3",
      name: "Kimi K3",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1048576
    },
    {
      id: "moonshotai/kimi-k3.1-pro",
      name: "Kimi K3.1 Pro",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 917504
    },
    {
      id: "minimax/minimax-m2.5",
      name: "MiniMax M2.5",
      isDefault: false,
      capabilities: ["reasoning"],
      contextLength: 204800
    },
    {
      id: "minimax/minimax-m2.7",
      name: "MiniMax M2.7",
      isDefault: false,
      capabilities: ["tools", "reasoning"],
      contextLength: 204800
    },
    {
      id: "minimax/minimax-m3",
      name: "MiniMax M3",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1048576
    },
    {
      id: "qwen/qwen3.8-flash",
      name: "Qwen 3.8 Flash",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1048576
    },
    {
      id: "qwen/qwen3.8-max",
      name: "Qwen 3.8 Max",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1048576
    },
    {
      id: "gemini/gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1048576
    },
    {
      id: "gemini/gemini-4-argon",
      name: "Gemini 4 Argon",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1048576
    },
    {
      id: "anthropic/claude-sonnet-5-5",
      name: "Claude Sonnet 5.5",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1000000
    },
    {
      id: "anthropic/claude-haiku-5-5",
      name: "Claude Haiku 5.5",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1000000
    },
    {
      id: "openai/gpt-6-luna",
      name: "GPT-6 Luna",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1050000
    },
    {
      id: "openai/gpt-6.1-sol",
      name: "GPT-6.1 Sol",
      isDefault: false,
      capabilities: ["tools", "reasoning", "vision"],
      contextLength: 1050000
    }
  ],
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
