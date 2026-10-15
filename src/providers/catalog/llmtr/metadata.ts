import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "llmtr",
  name: "LLMTR",
  alias: "llmtr",
  aliases: ["llmtr"],
  uiAlias: "llmtr",
  color: "#d97706",
  iconBg: "#ffffff",
  image: "/assets/providers/llmtr/icon.svg",
  website: "https://llmtr.com",
  notice: {
    apiKeyUrl: "https://llmtr.com",
    text: "OpenAI-compatible inference gateway offering rolling daily quota for selected open models."
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://llmtr.com/v1",
  baseUrls: ["https://llmtr.com/v1"],
  validateUrl: "https://llmtr.com/v1/models",
  format: "openai",
  defaultHeaders: {
    "Content-Type": "application/json"
  },
  thinkingMode: "auto",
  models: [
    {
      id: "nvidia/nemotron-3-ultra-550b-a55b",
      name: "Nemotron 3 Ultra 550B",
      isDefault: true,
      capabilities: ["tools"],
      contextLength: 131072
    },
    {
      id: "qwen/qwen3.8-27b-free",
      name: "Qwen 3.8 27B (Free)",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 131072
    }
  ],
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
