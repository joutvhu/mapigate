import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "septor",
  name: "Septor Labs",
  alias: "septor",
  aliases: ["septor", "septorlabs"],
  uiAlias: "septor",
  color: "#6366f1",
  iconBg: "#ffffff",
  image: "/assets/providers/septor/icon.svg",
  website: "https://septorlabs.com",
  notice: {
    apiKeyUrl: "https://septorlabs.com/pricing",
    text: "Septor Labs provides fast, free OpenAI-compatible inference for open-source AI models."
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://api.septorlabs.com/v1",
  baseUrls: ["https://api.septorlabs.com/v1"],
  validateUrl: "https://api.septorlabs.com/v1/models",
  format: "openai",
  defaultHeaders: {
    "Content-Type": "application/json"
  },
  thinkingMode: "auto",
  models: [
    {
      id: "qwen3-coder-free",
      name: "Qwen 3 Coder (Free)",
      isDefault: true,
      capabilities: ["tools"],
      contextLength: 131072
    },
    {
      id: "hermes-3-llama-3.1-405b-free",
      name: "Hermes 3 Llama 3.1 405B (Free)",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 131072
    },
    {
      id: "qwen3-next-80b-a3b-instruct-free",
      name: "Qwen 3 Next 80B A3B Instruct (Free)",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 131072
    },
    {
      id: "minimax-m2.5-free",
      name: "MiniMax M2.5 (Free)",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 131072
    }
  ],
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
