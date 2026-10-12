import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "nanogpt",
  "name": "NanoGPT",
  "alias": "nanogpt",
  "aliases": [
    "nanogpt"
  ],
  "uiAlias": "nanogpt",
  "color": "#10B981",
  "image": "/assets/providers/nanogpt/icon.svg",
  "website": "https://nano-gpt.com",
  "notice": {
    "apiKeyUrl": "https://nano-gpt.com/api"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://nano-gpt.com/api/v1/chat/completions",
  "baseUrls": [
    "https://nano-gpt.com/api/v1/chat/completions"
  ],
  "validateUrl": "https://nano-gpt.com/api/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "chatgpt-4o-latest",
      "name": "ChatGPT 4o Latest",
      "isDefault": true,
      "contextLength": 128000
    },
    {
      "id": "claude-3-7-sonnet",
      "name": "Claude 3.7 Sonnet",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-4o-mini",
      "name": "GPT-4o Mini",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "deepseek-r1",
      "name": "DeepSeek R1",
      "isDefault": false,
      "contextLength": 163840
    },
    {
      "id": "qwen-2.5-coder-32b",
      "name": "Qwen 2.5 Coder 32B",
      "isDefault": false,
      "contextLength": 131072
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
