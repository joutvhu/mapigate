import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "linkup",
  "name": "Linkup",
  "alias": "linkup",
  "color": "#0EA5E9",
  "image": "/assets/providers/linkup/icon.png",
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

export const provider = metadata;
export default metadata;
