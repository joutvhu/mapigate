import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "topaz",
  "name": "Topaz",
  "alias": "topaz",
  "color": "#059669",
  "image": "/providers/topaz.png",
  "website": "https://topazlabs.com",
  "notice": {
    "apiKeyUrl": "https://topazlabs.com/account"
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
