import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "scaleway",
  "name": "Scaleway AI",
  "alias": "scw",
  "aliases": [
    "scaleway"
  ],
  "uiAlias": "scaleway",
  "color": "#4F0599",
  "image": "/assets/providers/scaleway/icon.svg",
  "website": "https://www.scaleway.com/en/docs/ai-data/generative-apis/",
  "notice": {
    "apiKeyUrl": "",
    "text": "Scaleway AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.scaleway.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.scaleway.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "scaleway-default",
      "name": "Scaleway AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
