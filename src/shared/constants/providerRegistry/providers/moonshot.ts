import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "moonshot",
  "name": "Kimi",
  "alias": "moonshot",
  "aliases": [
    "moonshot"
  ],
  "uiAlias": "moonshot",
  "color": "#1E40AF",
  "image": "/providers/moonshot.svg",
  "website": "https://platform.kimi.ai?aff=omniroute",
  "notice": {
    "apiKeyUrl": "",
    "text": "Kimi provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.moonshot.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.moonshot.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "moonshot-default",
      "name": "Kimi Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
