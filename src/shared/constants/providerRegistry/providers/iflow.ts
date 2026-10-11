import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "iflow",
  "name": "iFlow AI",
  "alias": "if",
  "color": "#6366F1",
  "image": "/providers/iflow.png",
  "website": "https://iflow.cn",
  "notice": {
    "signupUrl": "https://iflow.cn"
  },
  "category": "oauth",
  "baseUrl": "https://apis.iflow.cn/v1/chat/completions",
  "baseUrls": [
    "https://apis.iflow.cn/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "User-Agent": "iFlow-Cli"
  },
  "thinkingMode": "auto",
  "oauth": {
    "clientId": "REDACTED_IFLOW_CLIENT_ID",
    "clientSecret": "REDACTED_IFLOW_CLIENT_SECRET",
    "authorizeUrl": "https://iflow.cn/oauth",
    "tokenUrl": "https://iflow.cn/oauth/token",
    "userInfoUrl": "https://iflow.cn/api/oauth/getUserInfo",
    "extraParams": {
      "loginMethod": "phone",
      "type": "phone"
    },
    "refreshLeadMs": 86400000
  },
  "models": [
    {
      "id": "qwen3-coder-plus",
      "name": "Qwen3 Coder Plus",
      "isDefault": false
    },
    {
      "id": "qwen3-max",
      "name": "Qwen3 Max",
      "isDefault": false
    },
    {
      "id": "qwen3-vl-plus",
      "name": "Qwen3 VL Plus",
      "isDefault": false
    },
    {
      "id": "qwen3-max-preview",
      "name": "Qwen3 Max Preview",
      "isDefault": false
    },
    {
      "id": "qwen3-235b",
      "name": "Qwen3 235B A22B",
      "isDefault": false
    },
    {
      "id": "qwen3-235b-a22b-instruct",
      "name": "Qwen3 235B A22B Instruct",
      "isDefault": false
    },
    {
      "id": "qwen3-235b-a22b-thinking-2507",
      "name": "Qwen3 235B A22B Thinking",
      "isDefault": false
    },
    {
      "id": "qwen3-32b",
      "name": "Qwen3 32B",
      "isDefault": false
    },
    {
      "id": "kimi-k2",
      "name": "Kimi K2",
      "isDefault": false
    },
    {
      "id": "deepseek-v3.2",
      "name": "DeepSeek V3.2 Exp",
      "isDefault": false
    },
    {
      "id": "deepseek-v3.1",
      "name": "DeepSeek V3.1 Terminus",
      "isDefault": false
    },
    {
      "id": "deepseek-v3",
      "name": "DeepSeek V3 671B",
      "isDefault": false
    },
    {
      "id": "deepseek-r1",
      "name": "DeepSeek R1",
      "isDefault": false
    },
    {
      "id": "glm-4.7",
      "name": "GLM 4.7",
      "isDefault": false
    },
    {
      "id": "iflow-rome-30ba3b",
      "name": "iFlow ROME",
      "isDefault": false
    }
  ]
};

export default provider;
