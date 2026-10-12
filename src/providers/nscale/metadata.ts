import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "nscale",
  "name": "nScale",
  "alias": "nscale",
  "aliases": [
    "nscale"
  ],
  "uiAlias": "nscale",
  "color": "#0891B2",
  "image": "/assets/providers/nscale/icon.svg",
  "website": "https://nscale.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "nScale provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://inference.api.nscale.com/v1/chat/completions",
  "baseUrls": [
    "https://inference.api.nscale.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "nscale-default",
      "name": "nScale Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
