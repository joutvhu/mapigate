import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "topaz",
  "name": "Topaz",
  "alias": "topaz",
  "color": "#059669",
  "image": "/assets/providers/topaz/icon.png",
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

export const provider = metadata;
export default metadata;
