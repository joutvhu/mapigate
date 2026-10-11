import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "searchapi",
  "name": "SearchAPI",
  "alias": "searchapi",
  "color": "#0EA5A4",
  "image": "/providers/searchapi.png",
  "website": "https://www.searchapi.io",
  "notice": {
    "apiKeyUrl": "https://www.searchapi.io/dashboard"
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
