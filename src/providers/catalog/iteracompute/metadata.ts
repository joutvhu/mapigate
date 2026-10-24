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
  website: "https://iteracompute.com",
  notice: {
    apiKeyUrl: "https://iteracompute.com",
    text: "OpenAI-compatible gateway with 30M free monthly tokens (160k TPM) for Qwen, DeepSeek V4, and GLM models."
  },
  category: "freeTier",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://api.iteracompute.com/v1",
  baseUrls: ["https://api.iteracompute.com/v1"],
  validateUrl: "https://api.iteracompute.com/v1/models",
  format: "openai",
  defaultHeaders: {
    "Content-Type": "application/json"
  },
  thinkingMode: "auto",
  models: [
    {
      id: "qwen/qwen3.8-27b",
      name: "Qwen 3.8 27B",
      isDefault: true,
      capabilities: ["tools"],
      contextLength: 128000
    },
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 1048576
    },
    {
      id: "deepseek/deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 1048576
    },
    {
      id: "z-ai/glm-5.3-flash",
      name: "GLM 5.3 Flash",
      isDefault: false,
      capabilities: ["tools", "vision"],
      contextLength: 1048576
    }
  ],
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
