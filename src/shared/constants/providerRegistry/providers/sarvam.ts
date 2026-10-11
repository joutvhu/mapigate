import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "sarvam",
  "name": "Sarvam AI",
  "alias": "sarvam",
  "aliases": [
    "sarvam"
  ],
  "uiAlias": "sarvam",
  "color": "#0EA5E9",
  "image": "/providers/sarvam.svg",
  "website": "https://docs.sarvam.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "Sarvam AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.sarvam.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.sarvam.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "sarvam-default",
      "name": "Sarvam AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
