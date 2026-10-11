import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "maritalk",
  "name": "Maritalk",
  "alias": "maritalk",
  "aliases": [
    "maritalk"
  ],
  "uiAlias": "maritalk",
  "color": "#1D4ED8",
  "image": "/providers/maritalk.svg",
  "website": "https://www.maritaca.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "Maritalk provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "maritalk-default",
      "name": "Maritalk Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
