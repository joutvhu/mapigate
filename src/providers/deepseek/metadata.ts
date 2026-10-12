import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
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
      "isDefault": false
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-flash-vision-exp",
      "name": "DeepSeek V4 Flash Vision (Exp)",
      "isDefault": false
    },
    {
      "id": "deepseek-chat",
      "name": "DeepSeek V3.2 Chat",
      "isDefault": false
    },
    {
      "id": "deepseek-reasoner",
      "name": "DeepSeek V3.2 Reasoner",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
