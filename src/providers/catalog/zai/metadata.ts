import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "zai",
  "name": "Z.AI",
  "alias": "zai",
  "aliases": [
    "zai"
  ],
  "uiAlias": "zai",
  "color": "#2563EB",
  "image": "/assets/providers/zai/icon.svg",
  "website": "https://open.bigmodel.cn",
  "notice": {
    "apiKeyUrl": "",
    "text": "Z.AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.z.ai/api/anthropic/v1/messages",
  "baseUrls": [
    "https://api.z.ai/api/anthropic/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "zai-default",
      "name": "Z.AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
