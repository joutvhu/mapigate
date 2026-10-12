import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "doubao",
  "name": "Doubao",
  "alias": "doubao",
  "aliases": [
    "doubao"
  ],
  "uiAlias": "doubao",
  "color": "#FE2C55",
  "image": "/assets/providers/doubao/icon.svg",
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

export const provider = metadata;
export default metadata;
