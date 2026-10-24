import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  id: "cline",
  name: "Cline",
  alias: "cl",
  aliases: ["clinepass", "cl"],
  uiAlias: "cl",
  color: "#5B9BD5",
  iconBg: "#2b203c",
  image: "/assets/providers/cline/icon.png",
  website: "https://cline.bot",
  notice: {
    signupUrl: "https://app.cline.bot",
    apiKeyUrl: "https://app.cline.bot",
    text: "Cline & ClinePass unified gateway (cline.bot). Sign in via WorkOS OAuth or enter a ClinePass API key (clp_...)."
  },
  category: "oauth",
  authType: "oauth",
  authModes: ["oauth", "apikey"],
  baseUrl: "https://api.cline.bot/api/v1/chat/completions",
  baseUrls: [
    "https://api.cline.bot/api/v1/chat/completions"
  ],
  validateUrl: "",
  format: "openai",
  defaultHeaders: {
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline"
  },
  thinkingMode: "auto",
  oauth: {
    appBaseUrl: "https://app.cline.bot",
    apiBaseUrl: "https://api.cline.bot",
    authorizeUrl: "https://api.cline.bot/api/v1/auth/authorize",
    tokenExchangeUrl: "https://api.cline.bot/api/v1/auth/token",
    tokenUrl: "https://api.cline.bot/api/v1/auth/token",
    refreshUrl: "https://api.cline.bot/api/v1/auth/refresh"
  },
  models,
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
