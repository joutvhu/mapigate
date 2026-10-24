import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "onomeo",
  name: "Onomeo",
  alias: "onomeo",
  aliases: ["onomeo"],
  uiAlias: "onomeo",
  color: "#10B981",
  iconBg: "#ffffff",
  image: "/assets/providers/onomeo/icon.svg",
  website: "https://onomeo.com",
  notice: {
    apiKeyUrl: "https://onomeo.com",
    text: "OpenAI-compatible gateway providing rolling free quotas (30 requests/5 hours) on open-source coding and reasoning models."
  },
  category: "freeTier",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://onomeo.com/v1",
  baseUrls: ["https://onomeo.com/v1"],
  validateUrl: "https://onomeo.com/v1/models",
  format: "openai",
  defaultHeaders: {
    "Content-Type": "application/json"
  },
  thinkingMode: "auto",
  models: [
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      name: "Llama 3.3 70B Instruct",
      isDefault: true,
      capabilities: ["tools"],
      contextLength: 128000
    },
    {
      id: "qwen/qwen-2.5-coder-32b-instruct",
      name: "Qwen 2.5 Coder 32B Instruct",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 128000
    }
  ],
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
