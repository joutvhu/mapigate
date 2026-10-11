import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "linkup",
  "name": "Linkup",
  "alias": "linkup",
  "color": "#0EA5E9",
  "image": "/providers/linkup.png",
  "website": "https://linkup.so",
  "notice": {
    "apiKeyUrl": "https://app.linkup.so/api-keys"
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
