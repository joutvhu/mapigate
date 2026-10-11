import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "doubao",
  "name": "Doubao",
  "alias": "doubao",
  "aliases": [
    "doubao"
  ],
  "uiAlias": "doubao",
  "color": "#FE2C55",
  "image": "/providers/doubao.svg",
  "website": "https://doubao.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "Doubao provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
  "baseUrls": [
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "doubao-default",
      "name": "Doubao Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
