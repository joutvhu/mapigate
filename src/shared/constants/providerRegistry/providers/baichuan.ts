import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "baichuan",
  "name": "Baichuan",
  "alias": "baichuan",
  "aliases": [
    "baichuan"
  ],
  "uiAlias": "baichuan",
  "color": "#6366F1",
  "image": "/providers/baichuan.svg",
  "website": "https://www.baichuan-ai.com/",
  "notice": {
    "apiKeyUrl": "",
    "text": "Baichuan provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.baichuan-ai.com/v1/chat/completions",
  "baseUrls": [
    "https://api.baichuan-ai.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "baichuan-default",
      "name": "Baichuan Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
