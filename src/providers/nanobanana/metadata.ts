import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "nanobanana",
  "name": "NanoBanana API",
  "alias": "nanobanana",
  "aliases": [
    "nb"
  ],
  "uiAlias": "nb",
  "color": "#FFD700",
  "image": "/assets/providers/nanobanana/icon.png",
  "website": "https://nanobananaapi.ai",
  "notice": {
    "text": "3rd-party proxy for Google Nano Banana (Gemini 2.5/3 Flash Image). For official, use Gemini provider.",
    "apiKeyUrl": "https://nanobananaapi.ai/dashboard"
  },
  "category": "apikey",
  "baseUrl": "https://api.nanobananaapi.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.nanobananaapi.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.nanobananaapi.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "nanobanana-flash",
      "name": "NanoBanana Flash",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "nanobanana-pro",
      "name": "NanoBanana Pro",
      "isDefault": false,
      "kind": "image"
    }
  ]
};

export const provider = metadata;
export default metadata;
