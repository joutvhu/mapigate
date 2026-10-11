import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "reka",
  "name": "Reka",
  "alias": "reka",
  "aliases": [
    "reka"
  ],
  "uiAlias": "reka",
  "color": "#111827",
  "image": "/providers/reka.svg",
  "website": "https://docs.reka.ai/chat/overview",
  "notice": {
    "apiKeyUrl": "",
    "text": "Reka provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.reka.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.reka.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "reka-default",
      "name": "Reka Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
