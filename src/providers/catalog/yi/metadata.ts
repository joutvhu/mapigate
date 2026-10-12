import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "yi",
  "name": "Yi (01.AI)",
  "alias": "yi",
  "aliases": [
    "yi"
  ],
  "uiAlias": "yi",
  "color": "#10B981",
  "image": "/assets/providers/yi/icon.svg",
  "website": "https://01.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "Yi (01.AI) provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.lingyiwanwu.com/v1/chat/completions",
  "baseUrls": [
    "https://api.lingyiwanwu.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "yi-default",
      "name": "Yi (01.AI) Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
