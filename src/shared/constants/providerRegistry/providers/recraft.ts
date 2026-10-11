import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "recraft",
  "name": "Recraft",
  "alias": "recraft",
  "color": "#EC4899",
  "image": "/providers/recraft.png",
  "website": "https://recraft.ai",
  "notice": {
    "apiKeyUrl": "https://www.recraft.ai/profile/api"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "recraftv3",
      "name": "Recraft V3",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "recraftv2",
      "name": "Recraft V2",
      "isDefault": false,
      "kind": "image"
    }
  ]
};

export default provider;
