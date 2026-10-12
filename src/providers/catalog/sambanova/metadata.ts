import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "sambanova",
  "name": "SambaNova",
  "alias": "samba",
  "aliases": [
    "sambanova-ai"
  ],
  "uiAlias": "samba",
  "color": "#F97316",
  "image": "/assets/providers/sambanova/icon.png",
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

export const provider = metadata;
export default metadata;
