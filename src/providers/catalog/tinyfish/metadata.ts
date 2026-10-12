import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "tinyfish",
  "name": "TinyFish",
  "alias": "tinyfish",
  "color": "#FF6700",
  "image": "/assets/providers/tinyfish/icon.png",
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

export const provider = metadata;
export default metadata;
