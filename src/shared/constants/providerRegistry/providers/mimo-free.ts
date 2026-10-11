import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "mimo-free",
  "name": "MiMo Code Free",
  "alias": "mmf",
  "uiAlias": "mmf",
  "color": "#FF6900",
  "image": "/providers/mimo-free.png",
  "category": "free",
  "noAuth": true,
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
  ],
  "passthroughModels": true
};

export default provider;
