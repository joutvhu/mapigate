import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "brave-search",
  "name": "Brave Search",
  "alias": "brave",
  "color": "#FB542B",
  "image": "/providers/brave-search.png",
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

export default provider;
