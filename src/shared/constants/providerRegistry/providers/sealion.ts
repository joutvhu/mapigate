import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "sealion",
  "name": "SEA-LION",
  "alias": "sealion",
  "aliases": [
    "sealion"
  ],
  "uiAlias": "sealion",
  "color": "#0D9488",
  "image": "/providers/sealion.svg",
  "website": "https://sea-lion.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "SEA-LION provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.sea-lion.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.sea-lion.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "sealion-default",
      "name": "SEA-LION Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
