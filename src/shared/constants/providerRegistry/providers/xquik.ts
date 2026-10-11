import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "xquik",
  "name": "Xquik",
  "alias": "xquik",
  "color": "#5C3327",
  "image": "/providers/xquik.png",
  "website": "https://docs.xquik.com/api-reference/x/search-tweets",
  "notice": {
    "apiKeyUrl": "https://xquik.com",
    "text": "Searches public X posts. Billing uses 1 Xquik credit per returned post."
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
