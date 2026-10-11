import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "blackbox",
  "name": "Blackbox AI",
  "alias": "blackbox",
  "aliases": [
    "bb"
  ],
  "uiAlias": "bb",
  "color": "#5B5FEF",
  "image": "/providers/blackbox.png",
  "website": "https://blackbox.ai",
  "notice": {
    "apiKeyUrl": "https://www.blackbox.ai/api-management"
  },
  "category": "apikey",
  "baseUrl": "https://api.blackbox.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.blackbox.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "thinkingOptions": [
    "auto",
    "none",
    "low",
    "medium",
    "high",
    "xhigh"
  ],
  "models": [
    {
      "id": "claude-fable-5",
      "name": "Claude Fable 5",
      "upstreamModelId": "blackboxai/anthropic/claude-fable-5",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.8",
      "name": "Claude Opus 4.8",
      "upstreamModelId": "blackboxai/anthropic/claude-opus-4.8",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "upstreamModelId": "blackboxai/anthropic/claude-sonnet-4.6",
      "isDefault": false
    },
    {
      "id": "gpt-5.5",
      "name": "GPT-5.5",
      "upstreamModelId": "blackboxai/openai/gpt-5.5",
      "isDefault": false
    },
    {
      "id": "gpt-5.4-pro",
      "name": "GPT-5.4 Pro",
      "upstreamModelId": "blackboxai/openai/gpt-5.4-pro",
      "isDefault": false
    },
    {
      "id": "gpt-5.4",
      "name": "GPT-5.4",
      "upstreamModelId": "blackboxai/openai/gpt-5.4",
      "isDefault": false
    },
    {
      "id": "gpt-5.3-codex",
      "name": "GPT-5.3 Codex",
      "upstreamModelId": "blackboxai/openai/gpt-5.3-codex",
      "isDefault": false
    },
    {
      "id": "gpt-5.4-nano",
      "name": "GPT-5.4 Nano",
      "upstreamModelId": "blackboxai/openai/gpt-5.4-nano",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "upstreamModelId": "blackboxai/deepseek/deepseek-v4-flash",
      "isDefault": false
    },
    {
      "id": "grok-4.3",
      "name": "Grok 4.3",
      "upstreamModelId": "blackboxai/x-ai/grok-4.3",
      "isDefault": false
    }
  ]
};

export default provider;
