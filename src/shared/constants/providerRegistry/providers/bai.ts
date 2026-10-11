import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "bai",
  "name": "B.AI",
  "alias": "bai",
  "aliases": [
    "b-ai"
  ],
  "uiAlias": "bai",
  "color": "#0369A1",
  "image": "/providers/bai.png",
  "website": "https://b.ai",
  "notice": {
    "text": "OpenAI-compatible gateway with one of the larger catalogues here. Accepts a bearer token or an x-api-key header. Model ids are fetched live from the provider.",
    "apiKeyUrl": "https://b.ai"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.b.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.b.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.b.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [],
  "passthroughModels": true
};

export default provider;
