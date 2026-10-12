import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "longcat",
  "name": "LongCat AI",
  "alias": "lc",
  "aliases": [
    "longcat"
  ],
  "uiAlias": "longcat",
  "color": "#FF6B9D",
  "image": "/assets/providers/longcat/icon.svg",
  "website": "https://longcat.chat/platform/docs",
  "notice": {
    "apiKeyUrl": "",
    "text": "LongCat AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.longcat.chat/openai/v1/chat/completions",
  "baseUrls": [
    "https://api.longcat.chat/openai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "longcat-default",
      "name": "LongCat AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
