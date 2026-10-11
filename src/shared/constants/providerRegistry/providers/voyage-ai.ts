import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "voyage-ai",
  "name": "Voyage AI",
  "alias": "voyage-ai",
  "uiAlias": "voyage",
  "color": "#0EA5E9",
  "image": "/providers/voyage-ai.png",
  "website": "https://www.voyageai.com",
  "notice": {
    "apiKeyUrl": "https://dash.voyageai.com/api-keys"
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
      "id": "voyage-3-large",
      "name": "Voyage 3 Large",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "voyage-3.5",
      "name": "Voyage 3.5",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "voyage-3.5-lite",
      "name": "Voyage 3.5 Lite",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "voyage-code-3",
      "name": "Voyage Code 3",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "voyage-finance-2",
      "name": "Voyage Finance 2",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "voyage-law-2",
      "name": "Voyage Law 2",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "voyage-multilingual-2",
      "name": "Voyage Multilingual 2",
      "isDefault": false,
      "kind": "embedding"
    }
  ]
};

export default provider;
