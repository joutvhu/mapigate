import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "v0-vercel",
  "name": "v0 (Vercel)",
  "alias": "v0",
  "aliases": [
    "v0-vercel",
    "v0"
  ],
  "uiAlias": "v0",
  "color": "#000000",
  "image": "/assets/providers/v0-vercel/icon.svg",
  "website": "https://v0.dev",
  "notice": {
    "apiKeyUrl": "https://v0.dev/chat/api",
    "text": "Vercel v0 generative UI and frontend code generation API."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.v0.dev/v1/chat/completions",
  "baseUrls": [
    "https://api.v0.dev/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "v0-1.5-md",
      "name": "v0 1.5 Medium",
      "isDefault": true,
      "contextLength": 128000
    },
    {
      "id": "v0-1.5-lg",
      "name": "v0 1.5 Large",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "v0-1.0-md",
      "name": "v0 1.0 Medium",
      "isDefault": false,
      "contextLength": 64000
    },
    {
      "id": "v0-code",
      "name": "v0 Code",
      "isDefault": false,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
