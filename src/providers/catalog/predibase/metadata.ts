import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "predibase",
  "name": "Predibase",
  "alias": "predibase",
  "aliases": [
    "predibase"
  ],
  "uiAlias": "predibase",
  "color": "#0F766E",
  "image": "/assets/providers/predibase/icon.png",
  "website": "https://predibase.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "Predibase provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://serving.app.predibase.com/v1/chat/completions",
  "baseUrls": [
    "https://serving.app.predibase.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "predibase-default",
      "name": "Predibase Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
