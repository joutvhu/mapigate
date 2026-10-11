import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "sambanova",
  "name": "SambaNova",
  "alias": "samba",
  "aliases": [
    "sambanova-ai"
  ],
  "uiAlias": "samba",
  "color": "#F97316",
  "image": "/providers/sambanova.png",
  "website": "https://sambanova.ai",
  "notice": {
    "apiKeyUrl": "https://cloud.sambanova.ai/apis"
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.sambanova.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.sambanova.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.sambanova.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "MiniMax-M2.7",
      "name": "MiniMax M2.7",
      "isDefault": false,
      "contextLength": 196608
    }
  ]
};

export default provider;
