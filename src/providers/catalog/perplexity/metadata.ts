import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "perplexity",
  "name": "Perplexity",
  "alias": "perplexity",
  "aliases": [
    "pplx",
    "perplexity-agent",
    "pplx-agent",
    "pplx-responses"
  ],
  "uiAlias": "pplx",
  "color": "#20808D",
  "iconBg": "#000000",
  "image": "/assets/providers/perplexity/icon.png",
  "website": "https://www.perplexity.ai",
  "notice": {
    "apiKeyUrl": "https://www.perplexity.ai/settings/api",
    "text": "Perplexity API (Sonar, Sonar Pro & Perplexity Agent models)."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.perplexity.ai/chat/completions",
  "baseUrls": [
    "https://api.perplexity.ai/chat/completions",
    "https://api.perplexity.ai/v1/responses"
  ],
  "validateUrl": "https://api.perplexity.ai/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "sonar-pro",
      "name": "Sonar Pro",
      "isDefault": true,
      "contextLength": 200000
    },
    {
      "id": "sonar",
      "name": "Sonar",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "sonar-reasoning-pro",
      "name": "Sonar Reasoning Pro",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "sonar-reasoning",
      "name": "Sonar Reasoning",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "sonar-deep-research",
      "name": "Sonar Deep Research",
      "isDefault": false,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
