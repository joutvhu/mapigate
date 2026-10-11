import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "alitp-intl",
  "name": "Alibaba Token Plan",
  "alias": "alitp-intl",
  "color": "#FF6A00",
  "image": "/providers/alitp-intl.png",
  "website": "https://www.alibabacloud.com/campaign/ai-landing-page-token",
  "notice": {
    "apiKeyUrl": "https://modelstudio.console.alibabacloud.com/?apiKey=1"
  },
  "category": "apikey",
  "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
  "baseUrls": [
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "qwen3.8-max-preview",
      "name": "Qwen3.8 Max Preview",
      "isDefault": false
    },
    {
      "id": "qwen3.7-max",
      "name": "Qwen3.7 Max",
      "isDefault": false
    },
    {
      "id": "qwen3.7-plus",
      "name": "Qwen3.7 Plus",
      "isDefault": false
    },
    {
      "id": "qwen3.6-flash",
      "name": "Qwen3.6 Flash",
      "isDefault": false
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": false
    }
  ]
};

export default provider;
