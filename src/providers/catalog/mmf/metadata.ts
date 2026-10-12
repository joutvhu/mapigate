import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "mmf",
  "name": "MMF",
  "color": "#6366F1",
  "image": "/assets/providers/mmf/icon.png",
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

export const provider = metadata;
export default metadata;
