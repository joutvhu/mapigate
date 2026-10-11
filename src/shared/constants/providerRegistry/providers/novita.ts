import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "novita",
  "name": "Novita AI",
  "alias": "novita",
  "aliases": [
    "novita"
  ],
  "uiAlias": "novita",
  "color": "#7C3AED",
  "image": "/providers/novita.png",
  "website": "https://novita.ai",
  "notice": {
    "apiKeyUrl": "https://novita.ai/settings/key-management"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.novita.ai/openai/v1/chat/completions",
  "baseUrls": [
    "https://api.novita.ai/openai/v1/chat/completions"
  ],
  "validateUrl": "https://api.novita.ai/openai/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "deepseek/deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": true,
      "contextLength": 1048576
    },
    {
      "id": "deepseek/deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "deepseek/deepseek-v3.2",
      "name": "DeepSeek V3.2",
      "isDefault": false,
      "contextLength": 163840
    },
    {
      "id": "moonshotai/kimi-k3",
      "name": "Kimi K3",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "moonshotai/kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "moonshotai/kimi-k2.6",
      "name": "Kimi K2.6",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "zai-org/glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "zai-org/glm-5.1",
      "name": "GLM 5.1",
      "isDefault": false,
      "contextLength": 204800
    },
    {
      "id": "qwen/qwen-2.5-coder-32b",
      "name": "Qwen 2.5 Coder 32B",
      "isDefault": false,
      "contextLength": 131072
    }
  ],
  "passthroughModels": true
};

export default provider;
