import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  id: "devin",
  name: "Devin",
  alias: "dvd",
  aliases: ["devin-cli", "devin-desktop", "devin-cli-agentic", "dvd"],
  uiAlias: "dvd",
  color: "#6366F1",
  image: "/assets/providers/devin/icon.png",
  website: "https://devin.ai",
  notice: {
    apiKeyUrl: "https://app.devin.ai/settings/keys",
    text: "Devin supports multiple connection modes: Personal Access Token (PAT from app.devin.ai/settings/keys), legacy API keys, or local ACP stdio bridge (devin://acp/stdio)."
  },
  category: "freeTier",
  authType: "apikey",
  authModes: ["apikey", "none"],
  baseUrl: "https://api.devin.ai",
  baseUrls: [
    "https://api.devin.ai",
    "devin://acp/stdio"
  ],
  validateUrl: "https://api.devin.ai/v3/self",
  format: "claude",
  defaultHeaders: {},
  thinkingMode: "auto",
  models,
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
