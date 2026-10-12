import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "fish-audio",
  "name": "Fish Audio",
  "alias": "fish",
  "color": "#1E9BF0",
  "image": "/assets/providers/fish-audio/icon.png",
  "website": "https://fish.audio",
  "notice": {
    "apiKeyUrl": "https://fish.audio/app/api-keys/"
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
