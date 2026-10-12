import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "jina-ai",
  "name": "Jina AI",
  "alias": "jina",
  "color": "#2563EB",
  "image": "/assets/providers/jina-ai/icon.png",
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

export const provider = metadata;
export default metadata;
