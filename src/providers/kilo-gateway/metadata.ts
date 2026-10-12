import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "kilo-gateway",
  "name": "Kilo Gateway",
  "alias": "kgw",
  "aliases": [
    "kilo-gateway",
    "kilogateway"
  ],
  "uiAlias": "kgw",
  "color": "#8B5CF6",
  "image": "/assets/providers/kilo-gateway/icon.png",
  "website": "https://kilo.ai",
  "notice": {
    "apiKeyUrl": "https://kilo.ai/dashboard?tab=apiKeys"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.kilo.ai/api/gateway/chat/completions",
  "baseUrls": [
    "https://api.kilo.ai/api/gateway/chat/completions"
  ],
  "validateUrl": "https://api.kilo.ai/api/gateway/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "kilo-auto/free",
      "name": "Kilo Auto Free",
      "isDefault": false,
      "contextLength": 256000
    },
    {
      "id": "nvidia/nemotron-3-super-120b-a12b:free",
      "name": "Nemotron 3 Super 120B (Free)",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "nvidia/nemotron-3-ultra-550b-a55b:free",
      "name": "Nemotron 3 Ultra 550B (Free)",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "kwaipilot/kat-coder-pro-v2.5:free",
      "name": "Kat Coder Pro v2.5 (Free)",
      "isDefault": false,
      "contextLength": 256000
    },
    {
      "id": "kilo-auto/frontier",
      "name": "Kilo Auto Frontier",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "kilo-auto/balanced",
      "name": "Kilo Auto Balanced",
      "isDefault": false,
      "contextLength": 1000000
    }
  ]
};

export const provider = metadata;
export default metadata;
