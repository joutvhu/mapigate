import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "searxng",
  "name": "SearXNG",
  "alias": "searxng",
  "color": "#3B82F6",
  "image": "/providers/searxng.png",
  "website": "https://docs.searxng.org",
  "category": "freeTier",
  "authType": "none",
  "noAuth": true,
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export default provider;
