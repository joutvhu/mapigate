import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "openrouter",
  "name": "OpenRouter",
  "alias": "openrouter",
  "color": "#F97316",
  "image": "/assets/providers/openrouter/icon.png",
  "website": "https://openrouter.ai",
  "notice": {
    "text": "Free tier: 27+ free models, no credit card needed, 200 req/day. After  0 credit: 1,000 req/day.",
    "apiKeyUrl": "https://openrouter.ai/settings/keys"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
  "baseUrls": [
    "https://openrouter.ai/api/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "HTTP-Referer": "https://endpoint-proxy.local",
    "X-Title": "Endpoint Proxy"
  },
  "thinkingMode": "auto",
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
