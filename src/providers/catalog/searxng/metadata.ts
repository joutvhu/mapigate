import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "searxng",
  "name": "SearXNG",
  "alias": "searxng",
  "color": "#3B82F6",
  "image": "/assets/providers/searxng/icon.png",
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

export const provider = metadata;
export default metadata;
