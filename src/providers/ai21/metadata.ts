import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "ai21",
  "name": "AI21 Labs",
  "alias": "ai21",
  "aliases": [
    "ai21"
  ],
  "uiAlias": "ai21",
  "color": "#0284C7",
  "image": "/assets/providers/ai21/icon.svg",
  "website": "https://www.ai21.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "AI21 Labs provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.ai21.com/studio/v1/chat/completions",
  "baseUrls": [
    "https://api.ai21.com/studio/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "ai21-default",
      "name": "AI21 Labs Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
