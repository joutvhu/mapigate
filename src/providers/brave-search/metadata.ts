import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "brave-search",
  "name": "Brave Search",
  "alias": "brave",
  "color": "#FB542B",
  "image": "/assets/providers/brave-search/icon.png",
  "website": "https://brave.com/search/api",
  "notice": {
    "apiKeyUrl": "https://api-dashboard.search.brave.com/app/keys"
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
