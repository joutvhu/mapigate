import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "cline",
  "name": "Cline",
  "alias": "cl",
  "uiAlias": "cl",
  "color": "#5B9BD5",
  "image": "/assets/providers/cline/icon.png",
  "website": "https://cline.bot",
  "notice": {
    "signupUrl": "https://cline.bot"
  },
  "category": "oauth",
  "authModes": [
    "oauth"
  ],
  "baseUrl": "https://api.cline.bot/api/v1/chat/completions",
  "baseUrls": [
    "https://api.cline.bot/api/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline"
  },
  "thinkingMode": "auto",
  "oauth": {
    "appBaseUrl": "https://app.cline.bot",
    "apiBaseUrl": "https://api.cline.bot",
    "authorizeUrl": "https://api.cline.bot/api/v1/auth/authorize",
    "tokenExchangeUrl": "https://api.cline.bot/api/v1/auth/token",
    "refreshUrl": "https://api.cline.bot/api/v1/auth/refresh"
  },
  "models": [
    {
      "id": "anthropic/claude-opus-4.7",
      "name": "Claude Opus 4.7",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-opus-4.6",
      "name": "Claude Opus 4.6",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.3-codex",
      "name": "GPT-5.3 Codex",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.4",
      "name": "GPT-5.4",
      "isDefault": false
    },
    {
      "id": "google/gemini-3.1-pro-preview",
      "name": "Gemini 3.1 Pro Preview",
      "isDefault": false
    },
    {
      "id": "google/gemini-3.1-flash-lite-preview",
      "name": "Gemini 3.1 Flash Lite Preview",
      "isDefault": false
    },
    {
      "id": "kwaipilot/kat-coder-pro",
      "name": "KAT Coder Pro",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
