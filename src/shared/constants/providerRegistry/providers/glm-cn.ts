import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "glm-cn",
  "name": "GLM (China)",
  "alias": "glm-cn",
  "color": "#DC2626",
  "image": "/providers/glm-cn.png",
  "website": "https://open.bigmodel.cn",
  "notice": {
    "apiKeyUrl": "https://open.bigmodel.cn/usercenter/apikeys"
  },
  "category": "apikey",
  "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
  "baseUrls": [
    "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "glm-5.3",
      "name": "GLM 5.3",
      "isDefault": false
    },
    {
      "id": "glm-5.3-flash",
      "name": "GLM 5.3 Flash (Vision)",
      "isDefault": false
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false
    },
    {
      "id": "glm-5.1",
      "name": "GLM 5.1",
      "isDefault": false
    },
    {
      "id": "glm-5-turbo",
      "name": "GLM 5 Turbo",
      "isDefault": false
    },
    {
      "id": "glm-5",
      "name": "GLM 5",
      "isDefault": false
    },
    {
      "id": "glm-4.7",
      "name": "GLM-4.7",
      "isDefault": false
    },
    {
      "id": "glm-4.6v",
      "name": "GLM 4.6V (Vision)",
      "isDefault": false
    },
    {
      "id": "glm-4.6",
      "name": "GLM-4.6",
      "isDefault": false
    },
    {
      "id": "glm-4.5-air",
      "name": "GLM-4.5-Air",
      "isDefault": false
    }
  ]
};

export default provider;
