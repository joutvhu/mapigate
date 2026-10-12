import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "llm7",
  "name": "LLM7",
  "alias": "llm7",
  "aliases": [
    "llm-7"
  ],
  "uiAlias": "llm7",
  "color": "#7C3AED",
  "iconBg": "#ffffff",
  "image": "/assets/providers/llm7/icon.png",
  "website": "https://llm7.io",
  "notice": {
    "apiKeyUrl": "https://llm7.io"
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.llm7.io/v1/chat/completions",
  "baseUrls": [
    "https://api.llm7.io/v1/chat/completions"
  ],
  "validateUrl": "https://api.llm7.io/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "gpt-5.5",
      "name": "GPT-5.5 (LLM7)",
      "isDefault": false,
      "contextLength": 1050000
    },
    {
      "id": "claude-opus-5",
      "name": "Claude Opus 5 (LLM7)",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash (LLM7)",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "grok-4.5",
      "name": "Grok 4.5 (LLM7)",
      "isDefault": false,
      "contextLength": 500000
    },
    {
      "id": "kimi-k3",
      "name": "Kimi K3 (LLM7)",
      "isDefault": false,
      "contextLength": 1000000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
