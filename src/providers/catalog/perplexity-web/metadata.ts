import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "perplexity-web",
  "name": "Perplexity Web (Pro/Max)",
  "alias": "perplexity-web",
  "aliases": [
    "pw"
  ],
  "uiAlias": "pw",
  "color": "#20808D",
  "iconBg": "#000000",
  "image": "/assets/providers/perplexity-web/icon.png",
  "website": "https://www.perplexity.ai",
  "category": "webCookie",
  "authType": "cookie",
  "baseUrl": "https://www.perplexity.ai/rest/sse/perplexity_ask",
  "baseUrls": [
    "https://www.perplexity.ai/rest/sse/perplexity_ask"
  ],
  "validateUrl": "https://www.perplexity.ai/api/auth/session",
  "format": "perplexity-web",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "pplx-auto",
      "name": "Perplexity Auto (Free)",
      "isDefault": false
    },
    {
      "id": "pplx-sonar",
      "name": "Perplexity Sonar",
      "isDefault": false
    },
    {
      "id": "pplx-gpt",
      "name": "GPT-5.4 (via Perplexity)",
      "isDefault": false
    },
    {
      "id": "pplx-gemini",
      "name": "Gemini 3.1 Pro (via Perplexity)",
      "isDefault": false
    },
    {
      "id": "pplx-sonnet",
      "name": "Claude Sonnet 4.6 (via Perplexity)",
      "isDefault": false
    },
    {
      "id": "pplx-opus",
      "name": "Claude Opus 4.6 (via Perplexity)",
      "isDefault": false
    },
    {
      "id": "pplx-nemotron",
      "name": "Nemotron 3 Super (via Perplexity)",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
