import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "agnes",
  "name": "Agnes AI",
  "alias": "agnes",
  "aliases": [
    "agnes-ai"
  ],
  "uiAlias": "agnes",
  "color": "#7C3AED",
  "image": "/assets/providers/agnes/icon.png",
  "website": "https://agnes-ai.com",
  "notice": {
    "text": "OpenAI-compatible gateway from Agnes AI, offering free API credits on sign-up. Accepts a bearer token or an x-api-key header.",
    "apiKeyUrl": "https://platform.agnes-ai.com"
  },
  "category": "freeTier",
  "authType": "apikey",
  "baseUrl": "https://apihub.agnes-ai.com/v1/chat/completions",
  "baseUrls": [
    "https://apihub.agnes-ai.com/v1/chat/completions"
  ],
  "validateUrl": "https://apihub.agnes-ai.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "agnes-2.5-flash",
      "name": "Agnes 2.5 Flash",
      "isDefault": false
    },
    {
      "id": "agnes-2.5-pro",
      "name": "Agnes 2.5 Pro",
      "isDefault": false
    },
    {
      "id": "agnes-2.5-pro-beta",
      "name": "Agnes 2.5 Pro Beta",
      "isDefault": false
    },
    {
      "id": "agnes-3.0-flash",
      "name": "Agnes 3.0 Flash",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
