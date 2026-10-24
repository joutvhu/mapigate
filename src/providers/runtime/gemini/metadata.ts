import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
    "Requests (RPM)",
    "Requests (Daily)",
    "Tokens (TPM)",
    "Tokens (Daily)"
  ],
  id: "gemini",
  name: "Google Gemini",
  alias: "gemini",
  color: "#4285F4",
  image: "/assets/providers/gemini/icon.png",
  website: "https://aistudio.google.com",
  notice: {
    apiKeyUrl: "https://aistudio.google.com/app/apikey"
  },
  category: "freeTier",
  authType: "apikey",
  authModes: [
    "apikey"
  ],
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  baseUrls: [
    "https://generativelanguage.googleapis.com/v1beta/openai"
  ],
  validateUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
  format: "openai",
  defaultHeaders: {},
  thinkingMode: "auto",
  models
};

export const provider = metadata;
export default metadata;
