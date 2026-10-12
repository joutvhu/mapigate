import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "liquid",
  "name": "Liquid AI",
  "alias": "liquid",
  "aliases": [
    "liquid"
  ],
  "uiAlias": "liquid",
  "color": "#06B6D4",
  "image": "/assets/providers/liquid/icon.svg",
  "website": "https://liquid.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "Liquid AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://inference.liquid.ai/v1/chat/completions",
  "baseUrls": [
    "https://inference.liquid.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "liquid-default",
      "name": "Liquid AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
