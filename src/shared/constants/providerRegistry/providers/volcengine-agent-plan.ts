import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "volcengine-agent-plan",
  "name": "Volcengine Agent Plan",
  "alias": "veap",
  "aliases": [
    "volcengine-agent-plan",
    "veap"
  ],
  "uiAlias": "veap",
  "color": "#2563EB",
  "image": "/providers/volcengine-ark.png",
  "website": "https://console.volcengine.com/ark/region:cn-beijing/subscription/agent-plan",
  "notice": {
    "apiKeyUrl": "https://console.volcengine.com/ark/region:cn-beijing/apiKey",
    "text": "ByteDance Volcano Ark dedicated Agent Plan subscription endpoint (/api/plan/v3)."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
  "baseUrls": [
    "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "doubao-seed-evolving",
      "name": "Doubao Seed Evolving (Agent Plan)",
      "isDefault": true,
      "contextLength": 1048576
    },
    {
      "id": "doubao-seed-2-1-turbo-260628",
      "name": "Doubao Seed 2.1 Turbo (Agent Plan)",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "doubao-seed-2-0-lite-260215",
      "name": "Doubao Seed 2.0 Lite (Agent Plan)",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "doubao-seed-2-0-mini-260215",
      "name": "Doubao Seed 2.0 Mini (Agent Plan)",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "deepseek-v4-flash-ga-260731",
      "name": "DeepSeek V4 Flash GA (Agent Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "kimi-k3",
      "name": "Kimi K3 (Agent Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "glm-5-2-260617",
      "name": "GLM 5.2 (Agent Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code (Agent Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "minimax-m3",
      "name": "MiniMax M3 (Agent Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "deepseek-v4-pro-260425",
      "name": "DeepSeek V4 Pro (Agent Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "minimax-m2.7",
      "name": "MiniMax M2.7 (Agent Plan)",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6 (Agent Plan)",
      "isDefault": false,
      "contextLength": 1048576
    }
  ],
  "passthroughModels": true
};

export default provider;
