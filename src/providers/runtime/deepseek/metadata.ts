import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Balance",
      "Total Grants",
      "Topped-up Balance"
  ],
  "id": "deepseek",
  "name": "DeepSeek",
  "alias": "deepseek",
  "aliases": [
    "ds"
  ],
  "uiAlias": "ds",
  "color": "#4D6BFE",
  "image": "/assets/providers/deepseek/icon.png",
  "website": "https://deepseek.com",
  "notice": {
    "apiKeyUrl": "https://platform.deepseek.com/api_keys"
  },
  "category": "apikey",
  "baseUrl": "https://api.deepseek.com/chat/completions",
  "baseUrls": [
    "https://api.deepseek.com/chat/completions"
  ],
  "validateUrl": "https://api.deepseek.com/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-pro-max",
      "name": "DeepSeek V4 Pro Max",
      "upstreamModelId": "deepseek-v4-pro",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-pro-none",
      "name": "DeepSeek V4 Pro No Thinking",
      "upstreamModelId": "deepseek-v4-pro",
      "isDefault": false
    },
    {
      "id": "deepseek-v4.1-flash",
      "name": "DeepSeek V4.1 Flash",
      "upstreamModelId": "deepseek-flash",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "thinkingFormat": "deepseek",
        "contextWindow": 1000000,
        "maxOutput": 384000
      }
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-flash-vision-exp",
      "name": "DeepSeek V4 Flash Vision (Exp)",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "thinkingFormat": "deepseek",
        "contextWindow": 1000000,
        "maxOutput": 384000
      }
    },
    {
      "id": "deepseek-chat",
      "name": "DeepSeek V3.2 Chat",
      "isDefault": false,
      "capabilities": {
        "vision": false,
        "reasoning": true,
        "thinkingFormat": "deepseek",
        "contextWindow": 128000,
        "maxOutput": 64000
      }
    },
    {
      "id": "deepseek-reasoner",
      "name": "DeepSeek V3.2 Reasoner",
      "isDefault": false,
      "capabilities": {
        "vision": false,
        "reasoning": true,
        "thinkingFormat": "deepseek",
        "thinkingCanDisable": false,
        "contextWindow": 128000,
        "maxOutput": 64000
      }
    }
  ]
};

export const provider = metadata;
export default metadata;
