import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "sarvam",
  "name": "Sarvam AI",
  "alias": "sarvam",
  "aliases": [
    "sarvam"
  ],
  "uiAlias": "sarvam",
  "color": "#0EA5E9",
  "iconBg": "#ffffff",
  "image": "/assets/providers/sarvam/icon.svg",
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

export const provider = metadata;
export default metadata;
