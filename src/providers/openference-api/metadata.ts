import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "openference-api",
  "name": "Openference API",
  "alias": "ofa",
  "aliases": [
    "openference-api"
  ],
  "uiAlias": "openference-api",
  "color": "#6366F1",
  "image": "/assets/providers/openference-api/icon.svg",
  "website": "https://openference.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "Openference API provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.openference.com/v1/chat/completions",
  "baseUrls": [
    "https://api.openference.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "openference-api-default",
      "name": "Openference API Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
