import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "fireworks",
  "name": "Fireworks AI",
  "alias": "fireworks",
  "color": "#7B2EF2",
  "image": "/assets/providers/fireworks/icon.png",
  "website": "https://fireworks.ai",
  "notice": {
    "apiKeyUrl": "https://fireworks.ai/account/api-keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.fireworks.ai/inference/v1/chat/completions",
  "baseUrls": [
    "https://api.fireworks.ai/inference/v1/chat/completions"
  ],
  "validateUrl": "https://api.fireworks.ai/inference/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "accounts/fireworks/models/deepseek-v3p1",
      "name": "DeepSeek V3.1",
      "isDefault": false
    },
    {
      "id": "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "name": "Llama 3.3 70B",
      "isDefault": false
    },
    {
      "id": "accounts/fireworks/models/qwen3-235b-a22b",
      "name": "Qwen3 235B",
      "isDefault": false
    },
    {
      "id": "nomic-ai/nomic-embed-text-v1.5",
      "name": "Nomic Embed Text v1.5",
      "isDefault": false,
      "kind": "embedding"
    }
  ]
};

export const provider = metadata;
export default metadata;
