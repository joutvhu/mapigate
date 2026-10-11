import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "kimchi",
  "name": "Kimchi",
  "alias": "kimchi",
  "uiAlias": "kimchi",
  "color": "#FF521D",
  "image": "/providers/kimchi.png",
  "website": "https://kimchi.dev",
  "notice": {
    "signupUrl": "https://app.kimchi.dev"
  },
  "category": "freeTier",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://llm.kimchi.dev/openai/v1/chat/completions",
  "baseUrls": [
    "https://llm.kimchi.dev/openai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "User-Agent": "kimchi/0.1.50"
  },
  "thinkingMode": "auto",
  "oauth": {
    "webAppUrl": "https://app.kimchi.dev",
    "validationUrl": "https://api.cast.ai/v1/llm/openai/supported-providers",
    "userInfoUrl": "https://app.kimchi.dev/api/v1/me",
    "modelsUrl": "https://llm.kimchi.dev/v1/models/metadata?include_in_cli=true"
  },
  "models": [
    {
      "id": "minimax-m3",
      "name": "MiniMax-M3",
      "isDefault": false
    },
    {
      "id": "kimi-k2.7",
      "name": "Kimi-K2.7",
      "isDefault": false
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi-K2.6",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5",
      "name": "Kimi-K2.5",
      "isDefault": false
    },
    {
      "id": "nemotron-3-ultra-fp4",
      "name": "Nemotron 3 Ultra FP4",
      "isDefault": false
    },
    {
      "id": "minimax-m2.7",
      "name": "MiniMax-M2.7",
      "isDefault": false
    },
    {
      "id": "claude-opus-4-6",
      "name": "Claude Opus 4.6",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export default provider;
