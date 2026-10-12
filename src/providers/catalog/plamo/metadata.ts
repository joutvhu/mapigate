import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "plamo",
  "name": "PLaMo",
  "alias": "plamo",
  "aliases": [
    "plamo"
  ],
  "uiAlias": "plamo",
  "color": "#DC2626",
  "image": "/assets/providers/plamo/icon.svg",
  "website": "https://plamo.preferredai.jp/api",
  "notice": {
    "apiKeyUrl": "",
    "text": "PLaMo provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.platform.preferredai.jp/v1/chat/completions",
  "baseUrls": [
    "https://api.platform.preferredai.jp/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "plamo-default",
      "name": "PLaMo Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
