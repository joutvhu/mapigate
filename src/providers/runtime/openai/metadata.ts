import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Session",
      "Weekly",
      "Credits",
      "Balance"
  ],
  "id": "openai",
  "name": "OpenAI",
  "alias": "openai",
  "color": "#10A37F",
  "iconBg": "#ffffff",
  "image": "/assets/providers/openai/icon.png",
  "website": "https://platform.openai.com",
  "notice": {
    "apiKeyUrl": "https://platform.openai.com/api-keys"
  },
  "category": "apikey",
  "baseUrl": "https://api.openai.com/v1/chat/completions",
  "baseUrls": [
    "https://api.openai.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "thinkingOptions": [
    "auto",
    "none",
    "low",
    "medium",
    "high"
  ]
,
  models
};

export const provider = metadata;
export default metadata;
