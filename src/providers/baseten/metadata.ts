import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "baseten",
  "name": "Baseten",
  "alias": "baseten",
  "aliases": [
    "baseten"
  ],
  "uiAlias": "baseten",
  "color": "#111827",
  "image": "/assets/providers/baseten/icon.svg",
  "website": "https://baseten.co",
  "notice": {
    "apiKeyUrl": "",
    "text": "Baseten provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://inference.baseten.co/v1/chat/completions",
  "baseUrls": [
    "https://inference.baseten.co/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "baseten-default",
      "name": "Baseten Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
