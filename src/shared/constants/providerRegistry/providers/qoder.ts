import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "qoder",
  "name": "Qoder",
  "alias": "qd",
  "uiAlias": "qd",
  "color": "#EC4899",
  "image": "/providers/qoder.png",
  "website": "https://qoder.com",
  "notice": {
    "signupUrl": "https://qoder.com"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation",
  "baseUrls": [
    "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "oauth": {
    "openApiBaseUrl": "https://openapi.qoder.sh",
    "centerBaseUrl": "https://center.qoder.sh",
    "chatBaseUrl": "https://api3.qoder.sh",
    "deviceTokenUrl": "https://openapi.qoder.sh/api/v1/deviceToken/poll",
    "refreshUrl": "https://center.qoder.sh/algo/api/v3/user/refresh_token",
    "userInfoUrl": "https://openapi.qoder.sh/api/v1/userinfo",
    "quotaUsageUrl": "https://openapi.qoder.sh/api/v2/quota/usage",
    "loginUrl": "https://qoder.com/device/selectAccounts"
  },
  "models": [
    {
      "id": "ultimate",
      "name": "Ultimate",
      "isDefault": false
    },
    {
      "id": "auto",
      "name": "Auto",
      "isDefault": false
    },
    {
      "id": "performance",
      "name": "Performance",
      "isDefault": false
    },
    {
      "id": "efficient",
      "name": "Efficient",
      "isDefault": false
    },
    {
      "id": "lite",
      "name": "Lite",
      "isDefault": false
    },
    {
      "id": "qmodel_38max",
      "name": "Qwen3.8-Max",
      "isDefault": false
    },
    {
      "id": "qmodel_latest",
      "name": "Qwen3.7-Max",
      "isDefault": false
    },
    {
      "id": "qmodel",
      "name": "Qwen3.7-Plus",
      "isDefault": false
    },
    {
      "id": "qfmodel",
      "name": "Qwen3.8-Flash",
      "isDefault": false
    },
    {
      "id": "kmodel_latest",
      "name": "Kimi-K3",
      "isDefault": false
    },
    {
      "id": "kmodel",
      "name": "Kimi-K2.7-Code",
      "isDefault": false
    },
    {
      "id": "gmodel",
      "name": "GLM-5.3",
      "isDefault": false
    },
    {
      "id": "gfmodel",
      "name": "GLM-5.3-Flash",
      "isDefault": false
    },
    {
      "id": "dmodel",
      "name": "DeepSeek-V4-Pro",
      "isDefault": false
    },
    {
      "id": "dfmodel",
      "name": "DeepSeek-V4-Flash",
      "isDefault": false
    },
    {
      "id": "mmodel",
      "name": "MiniMax-M3",
      "isDefault": false
    }
  ]
};

export default provider;
