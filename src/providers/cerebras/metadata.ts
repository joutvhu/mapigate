import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "cerebras",
  "name": "Cerebras",
  "alias": "cerebras",
  "color": "#FF4F00",
  "image": "/assets/providers/cerebras/icon.png",
  "website": "https://www.cerebras.ai",
  "notice": {
    "apiKeyUrl": "https://cloud.cerebras.ai/platform"
  },
  "category": "apikey",
  "baseUrl": "https://api.cerebras.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.cerebras.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.cerebras.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "gpt-oss-120b",
      "name": "GPT OSS 120B",
      "isDefault": false
    },
    {
      "id": "zai-glm-4.7",
      "name": "ZAI GLM 4.7",
      "isDefault": false
    },
    {
      "id": "llama-3.3-70b",
      "name": "Llama 3.3 70B",
      "isDefault": false
    },
    {
      "id": "llama-4-scout-17b-16e-instruct",
      "name": "Llama 4 Scout",
      "isDefault": false
    },
    {
      "id": "qwen-3-235b-a22b-instruct-2507",
      "name": "Qwen3 235B A22B",
      "isDefault": false
    },
    {
      "id": "qwen-3-32b",
      "name": "Qwen3 32B",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
