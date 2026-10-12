import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "coze",
  "name": "Coze",
  "alias": "coze",
  "aliases": [
    "coze"
  ],
  "uiAlias": "coze",
  "color": "#3B82F6",
  "image": "/assets/providers/coze/icon.svg",
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

export const provider = metadata;
export default metadata;
