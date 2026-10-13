import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "nebius",
  "name": "Nebius AI",
  "alias": "nebius",
  "color": "#6C5CE7",
  "iconBg": "#e2ff4c",
  "image": "/assets/providers/nebius/icon.png",
  "website": "https://nebius.com",
  "notice": {
    "apiKeyUrl": "https://studio.nebius.com/settings/api-keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.studio.nebius.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.studio.nebius.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.studio.nebius.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "meta-llama/Llama-3.3-70B-Instruct",
      "name": "Llama 3.3 70B Instruct",
      "isDefault": false
    },
    {
      "id": "Qwen/Qwen3-Embedding-8B",
      "name": "Qwen3 Embedding 8B",
      "isDefault": false,
      "kind": "embedding"
    }
  ]
};

export const provider = metadata;
export default metadata;
