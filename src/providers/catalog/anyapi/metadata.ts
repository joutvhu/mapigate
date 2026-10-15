import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "anyapi",
  name: "AnyAPI",
  alias: "anyapi",
  aliases: ["anyapi"],
  uiAlias: "anyapi",
  color: "#059669",
  iconBg: "#ffffff",
  image: "/assets/providers/anyapi/icon.svg",
  website: "https://anyapi.ai",
  notice: {
    apiKeyUrl: "https://anyapi.ai",
    text: "OpenAI-compatible gateway providing 100K free tokens daily across free and basic open models."
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://api.anyapi.ai/v1",
  baseUrls: ["https://api.anyapi.ai/v1"],
  validateUrl: "https://api.anyapi.ai/v1/models",
  format: "openai",
  defaultHeaders: {
    "Content-Type": "application/json"
  },
  thinkingMode: "auto",
  models: [
    {
      id: "qwen/qwen3-coder:free",
      name: "Qwen 3 Coder (Free)",
      isDefault: true,
      capabilities: ["tools"],
      contextLength: 131072
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      name: "Llama 3.3 70B Instruct (Free)",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 131072
    },
    {
      id: "nvidia/nemotron-3-ultra-550b-a55b:free",
      name: "Nemotron 3 Ultra 550B (Free)",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 131072
    }
  ],
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
