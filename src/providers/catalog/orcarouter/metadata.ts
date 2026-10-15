import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "orcarouter",
  name: "OrcaRouter",
  alias: "orcarouter",
  aliases: ["orcarouter", "orca"],
  uiAlias: "orca",
  color: "#0284c7",
  iconBg: "#ffffff",
  image: "/assets/providers/orcarouter/icon.svg",
  website: "https://orcarouter.ai",
  notice: {
    apiKeyUrl: "https://orcarouter.ai",
    text: "OpenAI-compatible aggregator with rate-limited free aliases and model routing."
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://api.orcarouter.ai/v1",
  baseUrls: ["https://api.orcarouter.ai/v1"],
  validateUrl: "https://api.orcarouter.ai/v1/models",
  format: "openai",
  defaultHeaders: {
    "Content-Type": "application/json"
  },
  thinkingMode: "auto",
  models: [
    {
      id: "orcarouter/auto",
      name: "OrcaRouter Auto",
      isDefault: true,
      capabilities: ["tools"],
      contextLength: 128000
    }
  ],
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
