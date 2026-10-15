import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "jan",
  name: "Jan",
  alias: "jan-ai",
  aliases: ["jan-ai", "jan-local"],
  uiAlias: "jan",
  color: "#8B5CF6",
  iconBg: "#1E293B",
  image: "/assets/providers/jan/icon.png",
  website: "https://jan.ai",
  category: "freeTier",
  authType: "none",
  requiresApiKey: false,
  isLocal: true,
  noAuth: true,
  baseUrl: "http://localhost:1337/v1",
  defaultBaseUrl: "http://localhost:1337/v1",
  baseUrls: [
    "http://localhost:1337/v1",
    "http://127.0.0.1:1337/v1",
  ],
  validateUrl: "",
  format: "openai",
  defaultHeaders: {},
  thinkingMode: "auto",
  hasProviderSpecificData: true,
  models: [],
  passthroughModels: true,
};

export const provider = metadata;
export default metadata;
