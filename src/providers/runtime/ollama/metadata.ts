import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "ollama",
  "name": "Ollama Cloud",
  "alias": "ollama",
  "aliases": [
    "ollama-cloud"
  ],
  "color": "#ffffffff",
  "iconBg": "#FFFFFF",
  "image": "/assets/providers/ollama/icon.png",
  "website": "https://ollama.com",
  "notice": {
    "text": "Free tier: light usage, 1 cloud model at a time (limits reset every 5h & 7d). Pro $20/mo · Max $100/mo.",
    "apiKeyUrl": "https://ollama.com/settings/keys"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://ollama.com/api/chat",
  "baseUrls": [
    "https://ollama.com/api/chat"
  ],
  "validateUrl": "https://ollama.com/api/tags",
  "format": "ollama",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "gpt-oss:120b",
      "name": "GPT OSS 120B",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "isDefault": false
    },
    {
      "id": "glm-5",
      "name": "GLM 5",
      "isDefault": false
    },
    {
      "id": "minimax-m2.5",
      "name": "MiniMax M2.5",
      "isDefault": false
    },
    {
      "id": "glm-4.7-flash",
      "name": "GLM 4.7 Flash",
      "isDefault": false
    },
    {
      "id": "qwen3.5",
      "name": "Qwen3.5",
      "isDefault": false
    },
    {
      "id": "minimax-m3",
      "name": "MiniMax M3",
      "isDefault": false
    },
    {
      "id": "deepseek-v4.1-flash:cloud",
      "name": "DeepSeek V4.1 Flash",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
