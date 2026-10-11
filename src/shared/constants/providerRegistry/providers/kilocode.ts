import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "kilocode",
  "name": "Kilo Code",
  "alias": "kc",
  "uiAlias": "kc",
  "color": "#FF6B35",
  "image": "/providers/kilocode.png",
  "website": "https://kilocode.ai",
  "notice": {
    "signupUrl": "https://kilocode.ai"
  },
  "category": "oauth",
  "baseUrl": "https://api.kilo.ai/api/openrouter/chat/completions",
  "baseUrls": [
    "https://api.kilo.ai/api/openrouter/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "oauth": {
    "apiBaseUrl": "https://api.kilo.ai",
    "initiateUrl": "https://api.kilo.ai/api/device-auth/codes",
    "pollUrlBase": "https://api.kilo.ai/api/device-auth/codes"
  },
  "models": [
    {
      "id": "anthropic/claude-sonnet-4-20250514",
      "name": "Claude Sonnet 4",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-opus-4-20250514",
      "name": "Claude Opus 4",
      "isDefault": false
    },
    {
      "id": "google/gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "isDefault": false
    },
    {
      "id": "google/gemini-2.5-flash",
      "name": "Gemini 2.5 Flash",
      "isDefault": false
    },
    {
      "id": "openai/gpt-4.1",
      "name": "GPT-4.1",
      "isDefault": false
    },
    {
      "id": "openai/o3",
      "name": "o3",
      "isDefault": false
    },
    {
      "id": "deepseek/deepseek-chat",
      "name": "DeepSeek Chat",
      "isDefault": false
    },
    {
      "id": "deepseek/deepseek-reasoner",
      "name": "DeepSeek Reasoner",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export default provider;
