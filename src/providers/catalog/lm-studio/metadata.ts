import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "lm-studio",
  name: "LM Studio",
  alias: "lmstudio",
  aliases: ["lmstudio", "lm-studio-local"],
  uiAlias: "lms",
  color: "#2563EB",
  iconBg: "#1E293B",
  image: "/assets/providers/lm-studio/icon.png",
  website: "https://lmstudio.ai",
  category: "freeTier",
  authType: "none",
  requiresApiKey: false,
  isLocal: true,
  noAuth: true,
  baseUrl: "http://localhost:1234/v1",
  defaultBaseUrl: "http://localhost:1234/v1",
  baseUrls: [
    "http://localhost:1234/v1",
    "http://127.0.0.1:1234/v1",
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
