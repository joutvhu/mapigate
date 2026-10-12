import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "youcom",
  "name": "You.com Search",
  "alias": "youcom",
  "color": "#7C3AED",
  "image": "/assets/providers/youcom/icon.png",
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

export const provider = metadata;
export default metadata;
