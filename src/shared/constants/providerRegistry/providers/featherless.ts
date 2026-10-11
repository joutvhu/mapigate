import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "featherless",
  "name": "Featherless",
  "alias": "featherless",
  "aliases": [
    "fl"
  ],
  "uiAlias": "fl",
  "color": "#111827",
  "image": "/providers/featherless.png",
  "website": "https://featherless.ai",
  "notice": {
    "apiKeyUrl": "https://featherless.ai/account/api-keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.featherless.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.featherless.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.featherless.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "deepseek-ai/DeepSeek-V4-Pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V4-Flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false
    },
    {
      "id": "zai-org/GLM-5.2",
      "name": "GLM 5.2",
      "isDefault": false
    },
    {
      "id": "zai-org/GLM-5.1",
      "name": "GLM 5.1",
      "isDefault": false
    },
    {
      "id": "moonshotai/Kimi-K2.7-Code",
      "name": "Kimi K2.7 Code",
      "isDefault": false
    },
    {
      "id": "moonshotai/Kimi-K2.6",
      "name": "Kimi K2.6",
      "isDefault": false
    },
    {
      "id": "moonshotai/Kimi-K2.5",
      "name": "Kimi K2.5",
      "isDefault": false
    }
  ]
};

export default provider;
