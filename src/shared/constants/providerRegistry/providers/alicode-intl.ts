import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "alicode-intl",
  "name": "Alibaba Coding",
  "alias": "alicode-intl",
  "color": "#FF6A00",
  "image": "/providers/alicode-intl.png",
  "website": "https://www.alibabacloud.com/product/coding",
  "notice": {
    "apiKeyUrl": "https://www.alibabacloud.com/product/coding"
  },
  "category": "apikey",
  "baseUrl": "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions",
  "baseUrls": [
    "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "qwen3.5-plus",
      "name": "Qwen3.5 Plus",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "isDefault": false
    },
    {
      "id": "glm-5",
      "name": "GLM 5",
      "isDefault": false
    },
    {
      "id": "MiniMax-M2.5",
      "name": "MiniMax M2.5",
      "isDefault": false
    },
    {
      "id": "qwen3-coder-next",
      "name": "Qwen3 Coder Next",
      "isDefault": false
    },
    {
      "id": "qwen3-coder-plus",
      "name": "Qwen3 Coder Plus",
      "isDefault": false
    },
    {
      "id": "glm-4.7",
      "name": "GLM 4.7",
      "isDefault": false
    }
  ]
};

export default provider;
