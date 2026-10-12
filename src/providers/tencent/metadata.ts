import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "tencent",
  "name": "Tencent Hunyuan",
  "alias": "hunyuan",
  "aliases": [
    "hunyuan",
    "tencent-hunyuan"
  ],
  "uiAlias": "hunyuan",
  "color": "#0052D9",
  "image": "/assets/providers/tencent/icon.png",
  "website": "https://cloud.tencent.com/product/hunyuan",
  "notice": {
    "apiKeyUrl": "https://console.cloud.tencent.com/hunyuan/api-key"
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
  "baseUrls": [
    "https://api.hunyuan.cloud.tencent.com/v1/chat/completions"
  ],
  "validateUrl": "https://api.hunyuan.cloud.tencent.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "hunyuan-turbos-latest",
      "name": "Hunyuan TurboS Latest",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "hunyuan-t1-latest",
      "name": "Hunyuan T1 Latest",
      "isDefault": false,
      "contextLength": 256000
    }
  ]
};

export const provider = metadata;
export default metadata;
