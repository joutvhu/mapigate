import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "youcom",
  "name": "You.com Search",
  "alias": "youcom",
  "color": "#7C3AED",
  "image": "/providers/youcom.png",
  "website": "https://you.com",
  "notice": {
    "apiKeyUrl": "https://api.you.com"
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
