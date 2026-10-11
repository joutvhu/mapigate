import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "mmf",
  "name": "MMF",
  "color": "#6366F1",
  "image": "/providers/mmf.png",
  "category": "apikey",
  "baseUrl": "https://api.xiaomimimo.com/api/free-ai/openai/chat",
  "baseUrls": [
    "https://api.xiaomimimo.com/api/free-ai/openai/chat"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "mimo-auto",
      "name": "MiMo Auto",
      "isDefault": false
    }
  ]
};

export default provider;
