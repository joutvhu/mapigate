import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "cartesia",
  "name": "Cartesia",
  "alias": "cartesia",
  "color": "#FF4F8B",
  "image": "/providers/cartesia.png",
  "website": "https://cartesia.ai",
  "notice": {
    "apiKeyUrl": "https://play.cartesia.ai/keys"
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
