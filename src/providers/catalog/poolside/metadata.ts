import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "poolside",
  "name": "Poolside",
  "alias": "poolside",
  "aliases": [
    "ps"
  ],
  "uiAlias": "ps",
  "color": "#0EA5E9",
  "iconBg": "#4337ff",
  "image": "/assets/providers/poolside/icon.png",
  "website": "https://poolside.ai",
  "notice": {
    "apiKeyUrl": "https://platform.poolside.ai/api-keys"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://inference.poolside.ai/v1/chat/completions",
  "baseUrls": [
    "https://inference.poolside.ai/v1/chat/completions"
  ],
  "validateUrl": "https://inference.poolside.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "poolside/laguna-s-2.1",
      "name": "Laguna S 2.1",
      "isDefault": false
    },
    {
      "id": "poolside/laguna-xs-2.1",
      "name": "Laguna XS 2.1",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
