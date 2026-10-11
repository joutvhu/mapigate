import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "typhoon",
  "name": "Typhoon",
  "alias": "typhoon",
  "aliases": [
    "typhoon"
  ],
  "uiAlias": "typhoon",
  "color": "#7C3AED",
  "image": "/providers/typhoon.svg",
  "website": "https://docs.opentyphoon.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "Typhoon provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.opentyphoon.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.opentyphoon.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "typhoon-default",
      "name": "Typhoon Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
