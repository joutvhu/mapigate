import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "tokenharbor",
  "name": "Token Harbor",
  "alias": "tokenharbor",
  "aliases": [
    "th",
    "thh"
  ],
  "uiAlias": "tokenharbor",
  "color": "#0F766E",
  "image": "/assets/providers/tokenharbor/icon.png",
  "website": "https://tokenharbor.ai",
  "notice": {
    "text": "OpenAI-compatible aggregator. One API key reaches every model, billed per-token from a prepaid wallet. Model ids are bare (e.g. claude-opus-5.5, gpt-6-astra, deepseek-v4.1-flash:free) and are fetched live from the provider.",
    "apiKeyUrl": "https://tokenharbor.ai/dashboard"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://tokenharbor.ai/v1/chat/completions",
  "baseUrls": [
    "https://tokenharbor.ai/v1/chat/completions"
  ],
  "validateUrl": "https://tokenharbor.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "claude-opus-5.5",
      "name": "Claude Opus 5.5",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "isDefault": false
    },
    {
      "id": "gpt-6-astra",
      "name": "GPT-6 Astra",
      "isDefault": false
    },
    {
      "id": "gpt-6-sol",
      "name": "GPT-6 Sol",
      "isDefault": false
    },
    {
      "id": "deepseek-v4.1-flash:free",
      "name": "DeepSeek V4.1 Flash (Free)",
      "isDefault": false
    },
    {
      "id": "grok-4.7",
      "name": "Grok 4.7",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
