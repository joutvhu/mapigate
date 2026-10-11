import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "codebuddy-cn",
  "name": "CodeBuddy CN",
  "alias": "cbcn",
  "uiAlias": "cbcn",
  "color": "#006EFF",
  "image": "/providers/codebuddy-cn.png",
  "website": "https://copilot.tencent.com",
  "notice": {
    "signupUrl": "https://copilot.tencent.com"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://copilot.tencent.com/v2/chat/completions",
  "baseUrls": [
    "https://copilot.tencent.com/v2/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "User-Agent": "CLI/2.108.1 CodeBuddy/2.108.1",
    "X-Product": "SaaS",
    "X-IDE-Type": "CLI",
    "X-IDE-Name": "CLI",
    "x-requested-with": "XMLHttpRequest",
    "x-codebuddy-request": "1"
  },
  "thinkingMode": "auto",
  "oauth": {
    "baseUrl": "https://copilot.tencent.com",
    "stateUrl": "https://copilot.tencent.com/v2/plugin/auth/state",
    "tokenUrl": "https://copilot.tencent.com/v2/plugin/auth/token",
    "refreshUrl": "https://copilot.tencent.com/v2/plugin/auth/token/refresh",
    "userAgent": "CLI/2.63.2 CodeBuddy/2.63.2",
    "platform": "CLI",
    "pollInterval": 5000
  },
  "models": [
    {
      "id": "glm-5.2",
      "name": "GLM-5.2",
      "isDefault": false
    },
    {
      "id": "glm-5.1",
      "name": "GLM-5.1",
      "isDefault": false
    },
    {
      "id": "minimax-m3",
      "name": "MiniMax-M3",
      "isDefault": false
    },
    {
      "id": "hy3",
      "name": "Hy3",
      "isDefault": false
    },
    {
      "id": "hy4-preview",
      "name": "Hy4-Preview",
      "isDefault": false
    },
    {
      "id": "glm-5.3",
      "name": "GLM-5.3",
      "isDefault": false
    },
    {
      "id": "glm-5.3-flash",
      "name": "GLM-5.3-Flash",
      "isDefault": false
    },
    {
      "id": "kimi-k3-1",
      "name": "Kimi-K3",
      "isDefault": false
    },
    {
      "id": "kimi-k2.8-preview",
      "name": "Kimi-K2.8-Preview",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek-V4-Pro",
      "isDefault": false
    },
    {
      "id": "deepseek-v4.1-flash",
      "name": "DeepSeek-V4.1-Flash",
      "isDefault": false
    }
  ]
};

export default provider;
