import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "jina-ai",
  "name": "Jina AI",
  "alias": "jina",
  "color": "#2563EB",
  "image": "/providers/jina-ai.png",
  "website": "https://jina.ai",
  "notice": {
    "text": "10M free tokens on signup (non-commercial), no credit card required.",
    "apiKeyUrl": "https://jina.ai/?sui=apikey"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export default provider;
