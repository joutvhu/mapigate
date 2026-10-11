import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "volcengine-coding-plan",
  "name": "Volcengine Coding Plan",
  "alias": "vecp",
  "aliases": [
    "volcengine-coding-plan",
    "vecp"
  ],
  "uiAlias": "vecp",
  "color": "#3B82F6",
  "image": "/providers/volcengine-ark.png",
  "website": "https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan",
  "notice": {
    "apiKeyUrl": "https://console.volcengine.com/ark/region:cn-beijing/apiKey",
    "text": "ByteDance Volcano Ark dedicated Coding Plan subscription endpoint (/api/coding/v3)."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  "baseUrls": [
    "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "doubao-seed-2-1-turbo",
      "name": "Doubao Seed 2.1 Turbo (Coding Plan)",
      "isDefault": true,
      "contextLength": 262144
    },
    {
      "id": "doubao-seed-2.0-lite",
      "name": "Doubao Seed 2.0 Lite (Coding Plan)",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash (Coding Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2 (Coding Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code (Coding Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "minimax-m3",
      "name": "MiniMax M3 (Coding Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro (Coding Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "minimax-m2.7",
      "name": "MiniMax M2.7 (Coding Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6 (Coding Plan)",
      "isDefault": false,
      "contextLength": 1048576
    }
  ],
  "passthroughModels": true
};

export default provider;
