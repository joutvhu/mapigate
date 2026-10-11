import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "tokenrouter",
  "name": "TokenRouter",
  "alias": "tokenrouter",
  "aliases": [
    "tr"
  ],
  "uiAlias": "tokenrouter",
  "color": "#0EA5E9",
  "image": "/providers/tokenrouter.png",
  "website": "https://www.tokenrouter.com",
  "notice": {
    "text": "OpenAI-compatible gateway. 300+ models (OpenAI, Claude, Gemini, Qwen, DeepSeek, Kimi, GLM, dsb).",
    "apiKeyUrl": "https://www.tokenrouter.com"
  },
  "category": "apikey",
  "baseUrl": "https://api.tokenrouter.com/v1/chat/completions",
  "baseUrls": [
    "https://api.tokenrouter.com/v1/chat/completions"
  ],
  "validateUrl": "https://api.tokenrouter.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "high",
  "thinkingOptions": [
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
  ],
  "models": [
    {
      "id": "anthropic/claude-haiku-4.5",
      "name": "Claude Haiku 4.5",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-opus-4.8",
      "name": "Claude Opus 4.8",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-opus-4.8-fast",
      "name": "Claude Opus 4.8 Fast",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.4",
      "name": "Gpt 5.4",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.4-mini",
      "name": "Gpt 5.4 Mini",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.4-pro",
      "name": "Gpt 5.4 Pro",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.5",
      "name": "Gpt 5.5",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.6-sol",
      "name": "Gpt 5.6 Sol",
      "isDefault": false
    },
    {
      "id": "google/gemini-3.5-flash",
      "name": "Gemini 3.5 Flash",
      "isDefault": false
    },
    {
      "id": "google/gemini-3.6-flash",
      "name": "Gemini 3.6 Flash",
      "isDefault": false
    },
    {
      "id": "deepseek/deepseek-v4-flash",
      "name": "Deepseek V4 Flash",
      "isDefault": false
    },
    {
      "id": "deepseek/deepseek-v4-pro",
      "name": "Deepseek V4 Pro",
      "isDefault": false
    },
    {
      "id": "qwen/qwen3-coder-next",
      "name": "Qwen3 Coder Next",
      "isDefault": false
    },
    {
      "id": "qwen/qwen3.7-max",
      "name": "Qwen3.7 Max",
      "isDefault": false
    },
    {
      "id": "qwen/qwen3.8-max",
      "name": "Qwen3.8 Max",
      "isDefault": false
    },
    {
      "id": "moonshotai/kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "isDefault": false
    },
    {
      "id": "moonshotai/kimi-k3-free",
      "name": "Kimi K3 Free",
      "isDefault": false
    },
    {
      "id": "z-ai/glm-5.3-free",
      "name": "Glm 5.3 Free",
      "isDefault": false
    },
    {
      "id": "z-ai/glm-5.2",
      "name": "Glm 5.2",
      "isDefault": false
    },
    {
      "id": "z-ai/glm-5-turbo",
      "name": "Glm 5 Turbo",
      "isDefault": false
    },
    {
      "id": "x-ai/grok-4.5",
      "name": "Grok 4.5",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export default provider;
