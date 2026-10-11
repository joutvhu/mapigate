import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "byteplus",
  "name": "BytePlus ModelArk",
  "alias": "byteplus",
  "aliases": [
    "bpm"
  ],
  "uiAlias": "bpm",
  "color": "#2563EB",
  "image": "/providers/byteplus.png",
  "website": "https://console.byteplus.com/ark",
  "notice": {
    "text": "Free credits for new accounts. Access to Seed 2.0, Kimi K2 Thinking, GLM 4.7, GPT-OSS-120B models.",
    "apiKeyUrl": "https://console.byteplus.com/ark/region:ark+ap-southeast-1/apiKey"
  },
  "category": "freeTier",
  "baseUrl": "https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions",
  "baseUrls": [
    "https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "seed-2-0-pro-260328",
      "name": "Seed 2.0 Pro",
      "isDefault": false
    },
    {
      "id": "seed-2-0-code-preview-260328",
      "name": "Seed 2.0 Code Preview",
      "isDefault": false
    },
    {
      "id": "seed-2-0-mini-260215",
      "name": "Seed 2.0 Mini",
      "isDefault": false
    },
    {
      "id": "seed-2-0-lite-260228",
      "name": "Seed 2.0 Lite",
      "isDefault": false
    },
    {
      "id": "kimi-k2-thinking-251104",
      "name": "Kimi K2 Thinking",
      "isDefault": false
    },
    {
      "id": "glm-4-7-251222",
      "name": "GLM 4.7",
      "isDefault": false
    },
    {
      "id": "gpt-oss-120b-250805",
      "name": "GPT-OSS-120B",
      "isDefault": false
    }
  ]
};

export default provider;
