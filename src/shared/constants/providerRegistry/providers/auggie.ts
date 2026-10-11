import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "auggie",
  "name": "Augment (Auggie CLI)",
  "alias": "aug",
  "aliases": [
    "auggie",
    "aug",
    "augment"
  ],
  "uiAlias": "aug",
  "color": "#8B5CF6",
  "image": "/providers/auggie.svg",
  "website": "https://augmentcode.com",
  "notice": {
    "text": "Augment (Auggie CLI) requires the auggie binary installed and authenticated locally (auggie login). Mapigate connects via stdio and never stores your credentials."
  },
  "category": "free",
  "authType": "none",
  "authModes": [
    "none"
  ],
  "noAuth": true,
  "baseUrl": "auggie://cli/stdio",
  "baseUrls": [
    "auggie://cli/stdio"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "sonnet4.6",
      "name": "Sonnet 4.6",
      "isDefault": true,
      "contextLength": 200000
    },
    {
      "id": "sonnet4.6-500k",
      "name": "Sonnet 4.6 (500K)",
      "isDefault": false,
      "contextLength": 500000
    },
    {
      "id": "sonnet4.5",
      "name": "Sonnet 4.5",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "sonnet5-high",
      "name": "Claude Sonnet 5",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "opus4.6",
      "name": "Opus 4.6",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "opus4.6-500k",
      "name": "Opus 4.6 (500K)",
      "isDefault": false,
      "contextLength": 500000
    },
    {
      "id": "gemini-3.1-pro-preview",
      "name": "Gemini 3.1 Pro",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "gpt5",
      "name": "GPT-5",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt5.5",
      "name": "GPT-5.5",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "kimi-k2.7",
      "name": "Kimi K2.7 Code",
      "isDefault": false,
      "contextLength": 131000
    }
  ],
  "passthroughModels": true
};

export default provider;
