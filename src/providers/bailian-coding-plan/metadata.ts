import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "bailian-coding-plan",
  "name": "Bailian Coding Plan",
  "alias": "bcp",
  "aliases": [
    "bailian-coding-plan",
    "bcp",
    "alibaba-token-plan"
  ],
  "uiAlias": "bcp",
  "color": "#FF6A00",
  "image": "/assets/providers/bailian-coding-plan/icon.svg",
  "website": "https://www.alibabacloud.com/help/en/model-studio/token-plan-overview",
  "notice": {
    "apiKeyUrl": "https://bailian.console.aliyun.com/",
    "text": "Alibaba Cloud Model Studio Token Plan / Coding Plan. Native Anthropic Messages protocol support."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/v1/messages",
  "baseUrls": [
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "qwen3.8-max-preview",
      "name": "Qwen3.8 Max Preview",
      "isDefault": true,
      "contextLength": 1000000
    },
    {
      "id": "qwen3.7-max",
      "name": "Qwen3.7 Max",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "qwen3.7-plus",
      "name": "Qwen3.7 Plus",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "qwen3.6-flash",
      "name": "Qwen3.6 Flash",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": false,
      "contextLength": 163840
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
