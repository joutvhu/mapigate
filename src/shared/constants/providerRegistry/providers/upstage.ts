import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "upstage",
  "name": "Upstage",
  "alias": "upstage",
  "aliases": [
    "upstage"
  ],
  "uiAlias": "upstage",
  "color": "#0F766E",
  "image": "/providers/upstage.svg",
  "website": "https://www.upstage.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "Upstage provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.upstage.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.upstage.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "upstage-default",
      "name": "Upstage Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
