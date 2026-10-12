import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "xai",
  "name": "xAI (Grok)",
  "alias": "xai",
  "color": "#1DA1F2",
  "image": "/assets/providers/xai/icon.png",
  "website": "https://x.ai",
  "notice": {
    "apiKeyUrl": "https://console.x.ai"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api.x.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.x.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.x.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "grok-4.6",
      "name": "Grok 4.6",
      "isDefault": false
    },
    {
      "id": "grok-4.5",
      "name": "Grok 4.5",
      "isDefault": false
    },
    {
      "id": "grok-4",
      "name": "Grok 4",
      "isDefault": false
    },
    {
      "id": "grok-4-fast-reasoning",
      "name": "Grok 4 Fast Reasoning",
      "isDefault": false
    },
    {
      "id": "grok-code-fast-1",
      "name": "Grok Code Fast",
      "isDefault": false
    },
    {
      "id": "grok-3",
      "name": "Grok 3",
      "isDefault": false
    },
    {
      "id": "grok-2-image-1212",
      "name": "Grok 2 Image",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "grok-imagine-video",
      "name": "Grok Imagine Video",
      "isDefault": false,
      "kind": "video"
    }
  ]
};

export const provider = metadata;
export default metadata;
