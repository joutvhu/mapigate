import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "deepinfra",
  "name": "DeepInfra",
  "alias": "deepinfra",
  "aliases": [
    "deepinfra"
  ],
  "uiAlias": "deepinfra",
  "color": "#2563EB",
  "image": "/providers/deepinfra.svg",
  "website": "https://deepinfra.com",
  "notice": {
    "apiKeyUrl": "https://deepinfra.com/dash/api_keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.deepinfra.com/v1/openai/chat/completions",
  "baseUrls": [
    "https://api.deepinfra.com/v1/openai/chat/completions"
  ],
  "validateUrl": "https://api.deepinfra.com/v1/openai/models",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "deepseek-ai/DeepSeek-V3",
      "name": "DeepSeek V3",
      "isDefault": true,
      "contextLength": 163840
    },
    {
      "id": "deepseek-ai/DeepSeek-R1",
      "name": "DeepSeek R1",
      "isDefault": false,
      "contextLength": 163840
    },
    {
      "id": "deepseek-ai/DeepSeek-V4-Pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "deepseek-ai/DeepSeek-V4-Flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "Qwen/Qwen2.5-Coder-32B-Instruct",
      "name": "Qwen 2.5 Coder 32B Instruct",
      "isDefault": false,
      "contextLength": 131072
    },
    {
      "id": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "name": "Llama 3.3 70B Instruct Turbo",
      "isDefault": false,
      "contextLength": 131072
    },
    {
      "id": "NousResearch/Hermes-3-Llama-3.1-405B",
      "name": "Hermes 3 Llama 3.1 405B",
      "isDefault": false,
      "contextLength": 131072
    }
  ],
  "passthroughModels": true
};

export default provider;
