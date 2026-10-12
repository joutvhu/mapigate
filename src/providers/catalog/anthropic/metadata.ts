import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "anthropic",
  "name": "Anthropic",
  "alias": "anthropic",
  "color": "#D97757",
  "image": "/assets/providers/anthropic/icon.png",
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
      "id": "claude-3-7-sonnet",
      "name": "Claude 3.7 Sonnet",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-budget",
        "contextWindow": 200000,
        "maxOutput": 64000
      }
    },
    {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-adaptive",
        "contextWindow": 1000000,
        "maxOutput": 128000
      }
    },
    {
      "id": "claude-opus-5",
      "name": "Claude Opus 5",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-adaptive",
        "contextWindow": 1000000,
        "maxOutput": 128000
      }
    },
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

export const provider = metadata;
export default metadata;
