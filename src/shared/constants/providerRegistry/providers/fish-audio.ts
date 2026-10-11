import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "fish-audio",
  "name": "Fish Audio",
  "alias": "fish",
  "color": "#1E9BF0",
  "image": "/providers/fish-audio.png",
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

export default provider;
