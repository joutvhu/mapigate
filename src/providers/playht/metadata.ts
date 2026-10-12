import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "playht",
  "name": "PlayHT",
  "alias": "playht",
  "color": "#00B4D8",
  "image": "/assets/providers/playht/icon.png",
  "website": "https://play.ht",
  "notice": {
    "apiKeyUrl": "https://play.ht/studio/api-access"
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
