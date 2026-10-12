import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "black-forest-labs",
  "name": "Black Forest Labs",
  "alias": "black-forest-labs",
  "aliases": [
    "bfl"
  ],
  "uiAlias": "bfl",
  "color": "#111827",
  "image": "/assets/providers/black-forest-labs/icon.png",
  "website": "https://blackforestlabs.ai",
  "notice": {
    "apiKeyUrl": "https://api.bfl.ai"
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
      "id": "flux-pro-1.1",
      "name": "FLUX Pro 1.1",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "flux-pro-1.1-ultra",
      "name": "FLUX Pro 1.1 Ultra",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "flux-pro",
      "name": "FLUX Pro",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "flux-dev",
      "name": "FLUX Dev",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "flux-kontext-pro",
      "name": "FLUX Kontext Pro (Edit)",
      "isDefault": false,
      "capabilities": [
        "edit"
      ],
      "kind": "image"
    },
    {
      "id": "flux-kontext-max",
      "name": "FLUX Kontext Max (Edit)",
      "isDefault": false,
      "capabilities": [
        "edit"
      ],
      "kind": "image"
    }
  ]
};

export const provider = metadata;
export default metadata;
