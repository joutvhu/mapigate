import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Session (5h)",
      "Weekly (7d)",
      "Free Tokens (Daily)",
      "Wallet Balance"
  ],
  "id": "xkiro",
  "name": "xKiro",
  "alias": "xk",
  "aliases": [
    "xk",
    "xkiro"
  ],
  "uiAlias": "xk",
  "color": "#16a34a",
  "image": "/assets/providers/xkiro/icon.svg",
  "website": "https://xkiro.com",
  "notice": {
    "apiKeyUrl": "https://xkiro.com",
    "text": "AI Tokens for Agents — Access DeepSeek, Claude, ChatGPT, Gemini and open models via OpenAI-compatible endpoints."
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.xkiro.com/v1",
  "baseUrls": [
    "https://api.xkiro.com/v1"
  ],
  "validateUrl": "https://api.xkiro.com/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "Content-Type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "deepseek/deepseek-r1",
      "name": "DeepSeek R1",
      "isDefault": false,
      "capabilities": [
        "reasoning"
      ],
      "contextLength": 131072
    },
    {
      "id": "deepseek/deepseek-v3",
      "name": "DeepSeek V3",
      "isDefault": false,
      "capabilities": [
        "tools"
      ],
      "contextLength": 131072
    },
    {
      "id": "anthropic/claude-3-7-sonnet",
      "name": "Claude 3.7 Sonnet",
      "isDefault": false,
      "capabilities": [
        "vision",
        "reasoning",
        "tools"
      ],
      "contextLength": 200000
    },
    {
      "id": "anthropic/claude-3-5-sonnet",
      "name": "Claude 3.5 Sonnet",
      "isDefault": false,
      "capabilities": [
        "vision",
        "tools"
      ],
      "contextLength": 200000
    },
    {
      "id": "openai/gpt-4o",
      "name": "GPT-4o",
      "isDefault": false,
      "capabilities": [
        "vision",
        "tools"
      ],
      "contextLength": 128000
    },
    {
      "id": "openai/o3-mini",
      "name": "o3-mini",
      "isDefault": false,
      "capabilities": [
        "reasoning",
        "tools"
      ],
      "contextLength": 200000
    },
    {
      "id": "google/gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "isDefault": false,
      "capabilities": [
        "vision",
        "reasoning",
        "tools"
      ],
      "contextLength": 1000000
    },
    {
      "id": "google/gemini-2.5-flash",
      "name": "Gemini 2.5 Flash",
      "isDefault": false,
      "capabilities": [
        "vision",
        "tools"
      ],
      "contextLength": 1000000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
