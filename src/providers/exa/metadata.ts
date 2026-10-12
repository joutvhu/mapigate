import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "exa",
  "name": "Exa",
  "alias": "exa",
  "color": "#2563EB",
  "image": "/assets/providers/exa/icon.png",
  "website": "https://exa.ai",
  "notice": {
    "apiKeyUrl": "https://dashboard.exa.ai/api-keys"
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
