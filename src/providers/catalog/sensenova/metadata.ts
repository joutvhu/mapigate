import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "sensenova",
  "name": "SenseNova",
  "alias": "sensenova",
  "aliases": [
    "sensenova"
  ],
  "uiAlias": "sensenova",
  "color": "#0066FF",
  "image": "/assets/providers/sensenova/icon.svg",
  "website": "https://platform.sensenova.cn",
  "notice": {
    "apiKeyUrl": "https://platform.sensenova.cn/console",
    "text": "SenseNova registration appears to require a Chinese (+86) phone number for SMS verification — no international sign-up path is documented, so users outside mainland China may be unable to obtain an API key."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://token.sensenova.cn/v1/chat/completions",
  "baseUrls": [
    "https://token.sensenova.cn/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "sensenova-default",
      "name": "SenseNova Default",
      "isDefault": true,
      "contextLength": 128000
    },
    {
      "id": "sensenova-6.8-flash",
      "name": "SenseNova 6.8 Flash",
      "isDefault": false
    },
    {
      "id": "sensenova-6.8-flash-lite",
      "name": "SenseNova 6.8 Flash Lite",
      "isDefault": false
    },
    {
      "id": "deepseek-flash",
      "name": "DeepSeek V4.1 Flash",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false
    },
    {
      "id": "glm-5.3",
      "name": "GLM-5.3",
      "isDefault": false
    },
    {
      "id": "glm-5.2",
      "name": "GLM-5.2",
      "isDefault": false
    },
    {
      "id": "kimi-k3",
      "name": "Kimi K3",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
