import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "anthropic",
  "name": "Anthropic",
  "alias": "anthropic",
  "color": "#D97757",
  "image": "/providers/anthropic.png",
  "website": "https://console.anthropic.com",
  "notice": {
    "apiKeyUrl": "https://console.anthropic.com/settings/keys"
  },
  "category": "apikey",
  "baseUrl": "https://api.anthropic.com/v1/messages",
  "baseUrls": [
    "https://api.anthropic.com/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "anthropic-version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "claude-sonnet-4-20250514",
      "name": "Claude Sonnet 4",
      "isDefault": false
    },
    {
      "id": "claude-opus-4-20250514",
      "name": "Claude Opus 4",
      "isDefault": false
    },
    {
      "id": "claude-3-5-sonnet-20241022",
      "name": "Claude 3.5 Sonnet",
      "isDefault": false
    }
  ]
};

export default provider;
