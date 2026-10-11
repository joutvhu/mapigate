import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "volcengine-ark",
  "name": "Volcengine Ark",
  "alias": "volcengine-ark",
  "aliases": [
    "ark"
  ],
  "uiAlias": "ark",
  "color": "#1677FF",
  "image": "/providers/volcengine-ark.png",
  "website": "https://ark.cn-beijing.volces.com",
  "notice": {
    "apiKeyUrl": "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey"
  },
  "category": "apikey",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  "baseUrls": [
    "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "Doubao-Seed-2.0-Code",
      "name": "Doubao-Seed-2.0-Code",
      "isDefault": false
    },
    {
      "id": "Doubao-Seed-2.0-pro",
      "name": "Doubao-Seed-2.0-pro",
      "isDefault": false
    },
    {
      "id": "Doubao-Seed-2.0-lite",
      "name": "Doubao-Seed-2.0-lite",
      "isDefault": false
    },
    {
      "id": "Doubao-Seed-Code",
      "name": "Doubao-Seed-Code",
      "isDefault": false
    },
    {
      "id": "DeepSeek-V4-Flash",
      "name": "DeepSeek-V4-Flash",
      "isDefault": false
    },
    {
      "id": "DeepSeek-V4-Pro",
      "name": "DeepSeek-V4-Pro",
      "isDefault": false
    },
    {
      "id": "GLM-5.1",
      "name": "GLM-5.1",
      "isDefault": false
    },
    {
      "id": "MiniMax-M2.7",
      "name": "MiniMax-M2.7",
      "isDefault": false
    },
    {
      "id": "Kimi-K2.6",
      "name": "Kimi-K2.6",
      "isDefault": false
    }
  ]
};

export default provider;
