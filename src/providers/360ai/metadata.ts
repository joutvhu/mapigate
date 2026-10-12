import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "360ai",
  "name": "360 AI",
  "alias": "360ai",
  "aliases": [
    "360ai"
  ],
  "uiAlias": "360ai",
  "color": "#00B96B",
  "image": "/assets/providers/360ai/icon.svg",
  "website": "https://ai.360.cn",
  "notice": {
    "apiKeyUrl": "",
    "text": "360 AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "360ai-default",
      "name": "360 AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
