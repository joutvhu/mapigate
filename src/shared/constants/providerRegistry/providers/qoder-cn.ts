import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "qoder-cn",
  "name": "Qoder CN",
  "alias": "qdcn",
  "uiAlias": "qdcn",
  "color": "#EC4899",
  "image": "/providers/qoder-cn.png",
  "website": "https://qoder.com.cn",
  "notice": {
    "signupUrl": "https://qoder.com.cn"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation",
  "baseUrls": [
    "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "oauth": {
    "openApiBaseUrl": "https://openapi.qoder.com.cn",
    "centerBaseUrl": "https://gateway.qoder.com.cn",
    "chatBaseUrl": "https://gateway.qoder.com.cn",
    "deviceTokenUrl": "https://openapi.qoder.com.cn/api/v1/deviceToken/poll",
    "refreshUrl": "https://gateway.qoder.com.cn/algo/api/v3/user/refresh_token",
    "userInfoUrl": "https://openapi.qoder.com.cn/api/v1/userinfo",
    "quotaUsageUrl": "https://openapi.qoder.com.cn/api/v2/quota/usage",
    "loginUrl": "https://qoder.com.cn/device/selectAccounts"
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
