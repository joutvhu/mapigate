import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "codebuddy-intl",
  "name": "CodeBuddy",
  "alias": "cbai",
  "uiAlias": "cbai",
  "color": "#006EFF",
  "image": "/providers/codebuddy-intl.png",
  "website": "https://www.codebuddy.ai",
  "notice": {
    "signupUrl": "https://www.codebuddy.ai"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://www.codebuddy.ai/v2/chat/completions",
  "baseUrls": [
    "https://www.codebuddy.ai/v2/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "User-Agent": "IDE/2.108.1 CodeBuddy/2.108.1",
    "X-Product": "SaaS",
    "X-IDE-Type": "IDE",
    "X-IDE-Name": "IDE",
    "x-requested-with": "XMLHttpRequest",
    "x-codebuddy-request": "1"
  },
  "thinkingMode": "auto",
  "oauth": {
    "baseUrl": "https://www.codebuddy.ai",
    "stateUrl": "https://www.codebuddy.ai/v2/plugin/auth/state",
    "tokenUrl": "https://www.codebuddy.ai/v2/plugin/auth/token",
    "refreshUrl": "https://www.codebuddy.ai/v2/plugin/auth/token/refresh",
    "userAgent": "IDE/2.63.2 CodeBuddy/2.63.2",
    "platform": "ide",
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
      "id": "glm-5.0",
      "name": "GLM-5.0",
      "isDefault": false
    },
    {
      "id": "glm-5.0-turbo",
      "name": "GLM-5.0-Turbo",
      "isDefault": false
    },
    {
      "id": "glm-5v-turbo",
      "name": "GLM-5v-Turbo",
      "isDefault": false
    },
    {
      "id": "glm-4.7",
      "name": "GLM-4.7",
      "isDefault": false
    },
    {
      "id": "minimax-m3",
      "name": "MiniMax-M3",
      "isDefault": false
    },
    {
      "id": "minimax-m2.7",
      "name": "MiniMax-M2.7",
      "isDefault": false
    },
    {
      "id": "kimi-k2.7",
      "name": "Kimi-K2.7-Code",
      "isDefault": false
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi-K2.6",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5",
      "name": "Kimi-K2.5",
      "isDefault": false
    },
    {
      "id": "hy3-preview",
      "name": "Hy3 Preview",
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
    },
    {
      "id": "deepseek-v3-2-volc",
      "name": "DeepSeek-V3.2",
      "isDefault": false
    }
  ]
};

export default provider;
