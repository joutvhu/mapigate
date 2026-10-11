import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "coze",
  "name": "Coze",
  "alias": "coze",
  "aliases": [
    "coze"
  ],
  "uiAlias": "coze",
  "color": "#3B82F6",
  "image": "/providers/coze.svg",
  "website": "https://coze.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "Coze provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.coze.com/v1/chat/completions",
  "baseUrls": [
    "https://api.coze.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "coze-default",
      "name": "Coze Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
