import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "tinyfish",
  "name": "TinyFish",
  "alias": "tinyfish",
  "color": "#FF6700",
  "image": "/providers/tinyfish.png",
  "website": "https://www.tinyfish.ai/",
  "notice": {
    "apiKeyUrl": "https://agent.tinyfish.ai/api-keys"
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
