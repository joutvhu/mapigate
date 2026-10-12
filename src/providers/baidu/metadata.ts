import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "baidu",
  "name": "Baidu Qianfan",
  "alias": "qianfan",
  "aliases": [
    "qianfan",
    "ernie",
    "baidu-qianfan"
  ],
  "uiAlias": "qianfan",
  "color": "#2932E1",
  "image": "/assets/providers/baidu/icon.png",
  "website": "https://cloud.baidu.com/product/qianfan.html",
  "notice": {
    "apiKeyUrl": "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application"
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://qianfan.baidubce.com/v2/chat/completions",
  "baseUrls": [
    "https://qianfan.baidubce.com/v2/chat/completions"
  ],
  "validateUrl": "https://qianfan.baidubce.com/v2/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false,
      "contextLength": 512000
    },
    {
      "id": "glm-5.1",
      "name": "GLM 5.1",
      "isDefault": false,
      "contextLength": 198000
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "qwen3.5-397b-a17b",
      "name": "Qwen 3.5 397B A17B",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "qwen3.5-27b",
      "name": "Qwen 3.5 27B",
      "isDefault": false,
      "contextLength": 262144
    }
  ]
};

export const provider = metadata;
export default metadata;
