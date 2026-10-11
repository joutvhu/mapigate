import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "fal-ai",
  "name": "Fal.ai",
  "alias": "fal-ai",
  "aliases": [
    "fal"
  ],
  "uiAlias": "fal",
  "color": "#2563EB",
  "image": "/providers/fal-ai.png",
  "website": "https://fal.ai",
  "notice": {
    "apiKeyUrl": "https://fal.ai/dashboard/keys"
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
      "id": "fal-ai/flux/schnell",
      "name": "FLUX Schnell",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "fal-ai/flux/dev",
      "name": "FLUX Dev",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "fal-ai/flux-pro/v1.1",
      "name": "FLUX Pro v1.1",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "fal-ai/flux-pro/v1.1-ultra",
      "name": "FLUX Pro v1.1 Ultra",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "fal-ai/recraft-v3",
      "name": "Recraft V3",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "fal-ai/ideogram/v2",
      "name": "Ideogram V2",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "fal-ai/stable-diffusion-v35-large",
      "name": "SD 3.5 Large",
      "isDefault": false,
      "kind": "image"
    }
  ]
};

export default provider;
