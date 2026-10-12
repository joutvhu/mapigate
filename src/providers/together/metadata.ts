import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "together",
  "name": "Together AI",
  "alias": "together",
  "color": "#0F6FFF",
  "image": "/assets/providers/together/icon.png",
  "website": "https://www.together.ai",
  "notice": {
    "apiKeyUrl": "https://api.together.xyz/settings/api-keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.together.xyz/v1/chat/completions",
  "baseUrls": [
    "https://api.together.xyz/v1/chat/completions"
  ],
  "validateUrl": "https://api.together.xyz/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "name": "Llama 3.3 70B Turbo",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-R1",
      "name": "DeepSeek R1",
      "isDefault": false
    },
    {
      "id": "Qwen/Qwen3-235B-A22B",
      "name": "Qwen3 235B",
      "isDefault": false
    },
    {
      "id": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
      "name": "Llama 4 Maverick",
      "isDefault": false
    },
    {
      "id": "BAAI/bge-large-en-v1.5",
      "name": "BGE Large EN v1.5",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "togethercomputer/m2-bert-80M-8k-retrieval",
      "name": "M2 BERT 80M 8K",
      "isDefault": false,
      "kind": "embedding"
    }
  ]
};

export const provider = metadata;
export default metadata;
