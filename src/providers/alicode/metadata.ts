import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "alicode",
  "name": "Alibaba",
  "alias": "alicode",
  "color": "#FF6A00",
  "image": "/assets/providers/alicode/icon.png",
  "website": "https://bailian.console.aliyun.com",
  "notice": {
    "apiKeyUrl": "https://bailian.console.aliyun.com/?apiKey=1"
  },
  "category": "apikey",
  "baseUrl": "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
  "baseUrls": [
    "https://coding.dashscope.aliyuncs.com/v1/chat/completions"
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
      "id": "qwen3-max-2026-01-23",
      "name": "Qwen3 Max",
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

export const provider = metadata;
export default metadata;
