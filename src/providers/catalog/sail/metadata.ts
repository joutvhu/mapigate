import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "sail",
  name: "Sail Research",
  alias: "sail",
  aliases: ["sail", "sailresearch"],
  uiAlias: "sail",
  color: "#2563EB",
  iconBg: "#ffffff",
  image: "/assets/providers/sail/icon.svg",
  website: "https://sailresearch.com",
  notice: {
    apiKeyUrl: "https://sailresearch.com",
    text: "Responses & Chat API provider granting $5 monthly recurring credits for long reasoning and coding models."
  },
  category: "freeTier",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://api.sailresearch.com/v1",
  baseUrls: ["https://api.sailresearch.com/v1"],
  validateUrl: "https://api.sailresearch.com/v1/models",
  format: "responses",
  defaultHeaders: {
    "Content-Type": "application/json"
  },
  thinkingMode: "auto",
  models: [
    {
      id: "openai/gpt-oss-120b",
      name: "GPT-OSS 120B (Reasoning)",
      isDefault: true,
      capabilities: ["tools", "reasoning"],
      contextLength: 128000
    },
    {
      id: "sail/sail-coder-flash",
      name: "Sail Coder Flash",
      isDefault: false,
      capabilities: ["tools"],
      contextLength: 128000
    }
  ],
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
