import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "serper",
  "name": "Serper",
  "alias": "serper",
  "color": "#4F46E5",
  "image": "/assets/providers/serper/icon.png",
  "website": "https://serper.dev",
  "notice": {
    "apiKeyUrl": "https://serper.dev/api-key"
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
