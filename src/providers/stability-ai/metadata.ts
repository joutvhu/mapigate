import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "stability-ai",
  "name": "Stability AI",
  "alias": "stability-ai",
  "aliases": [
    "stability"
  ],
  "uiAlias": "stability",
  "color": "#8B5CF6",
  "image": "/assets/providers/stability-ai/icon.png",
  "website": "https://stability.ai",
  "notice": {
    "apiKeyUrl": "https://platform.stability.ai/account/keys"
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
      "id": "stable-image-ultra",
      "name": "Stable Image Ultra",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "stable-image-core",
      "name": "Stable Image Core",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "sd3.5-large",
      "name": "Stable Diffusion 3.5 Large",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "sd3.5-large-turbo",
      "name": "Stable Diffusion 3.5 Large Turbo",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "sd3.5-medium",
      "name": "Stable Diffusion 3.5 Medium",
      "isDefault": false,
      "kind": "image"
    }
  ]
};

export const provider = metadata;
export default metadata;
