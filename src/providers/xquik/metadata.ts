import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "xquik",
  "name": "Xquik",
  "alias": "xquik",
  "color": "#5C3327",
  "image": "/assets/providers/xquik/icon.png",
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

export const provider = metadata;
export default metadata;
