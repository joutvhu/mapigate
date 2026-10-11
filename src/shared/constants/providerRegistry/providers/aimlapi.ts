import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "aimlapi",
  "name": "AI/ML API",
  "alias": "aiml",
  "aliases": [
    "aimlapi"
  ],
  "uiAlias": "aimlapi",
  "color": "#6366F1",
  "image": "/providers/aimlapi.svg",
  "website": "https://aimlapi.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "AI/ML API provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.aimlapi.com/v1/chat/completions",
  "baseUrls": [
    "https://api.aimlapi.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "aimlapi-default",
      "name": "AI/ML API Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
