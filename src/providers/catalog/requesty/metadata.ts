import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "requesty",
  "name": "Requesty",
  "alias": "requesty",
  "aliases": [
    "req",
    "rqty"
  ],
  "uiAlias": "req",
  "color": "#9333EA",
  "iconBg": "#FFFFFF",
  "image": "/assets/providers/requesty/icon.png",
  "website": "https://requesty.ai",
  "notice": {
    "text": "Unified AI Router with permanent free models (20 RPM, 200 req/day for new orgs) and multi-provider routing. OpenAI-compatible.",
    "apiKeyUrl": "https://requesty.ai"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://router.requesty.ai/v1/chat/completions",
  "baseUrls": [
    "https://router.requesty.ai/v1/chat/completions"
  ],
  "validateUrl": "https://router.requesty.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "mistral/leanstral-1.5",
      "name": "Mistral Leanstral 1.5",
      "isDefault": false
    },
    {
      "id": "nemotron/nemotron-3-nano-30b-a3b",
      "name": "Nemotron 3 Nano 30B A3B",
      "isDefault": false
    },
    {
      "id": "ling/ling-3.0-tiny",
      "name": "Ling 3.0 Tiny",
      "isDefault": false
    },
    {
      "id": "openai/gpt-4o-mini",
      "name": "GPT-4o Mini",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-3-5-sonnet",
      "name": "Claude 3.5 Sonnet",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
