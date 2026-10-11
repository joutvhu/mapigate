import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "perplexity",
  "name": "Perplexity",
  "alias": "perplexity",
  "aliases": [
    "pplx"
  ],
  "uiAlias": "pplx",
  "color": "#20808D",
  "image": "/providers/perplexity.png",
  "website": "https://www.perplexity.ai",
  "notice": {
    "apiKeyUrl": "https://www.perplexity.ai/settings/api"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.perplexity.ai/chat/completions",
  "baseUrls": [
    "https://api.perplexity.ai/chat/completions"
  ],
  "validateUrl": "https://api.perplexity.ai/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "sonar-pro",
      "name": "Sonar Pro",
      "isDefault": false
    },
    {
      "id": "sonar",
      "name": "Sonar",
      "isDefault": false
    }
  ]
};

export default provider;
