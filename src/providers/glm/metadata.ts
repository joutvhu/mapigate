import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Session",
      "Weekly",
      "Balance"
  ],
  "id": "glm",
  "name": "Zai GLM Coding",
  "alias": "glm",
  "color": "#2563EB",
  "image": "/assets/providers/glm/icon.png",
  "website": "https://open.bigmodel.cn",
  "notice": {
    "apiKeyUrl": "https://open.bigmodel.cn/usercenter/apikeys",
    "signupUrl": "https://chat.z.ai"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api.z.ai/api/anthropic/v1/messages",
  "baseUrls": [
    "https://api.z.ai/api/anthropic/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "Anthropic-Version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
  },
  "thinkingMode": "auto",
  "oauth": {
    "providerId": "zai",
    "cliInitUrl": "https://zcode.z.ai/api/v1/oauth/cli/init",
    "cliPollUrl": "https://zcode.z.ai/api/v1/oauth/cli/poll",
    "businessLoginUrl": "https://api.z.ai/api/auth/z/login",
    "apiBaseUrl": "https://api.z.ai",
    "planApiKeyName": "zcode-api-key"
  },
  "models": [
    {
      "id": "glm-5.3",
      "name": "GLM 5.3",
      "isDefault": false
    },
    {
      "id": "glm-5.3-flash",
      "name": "GLM 5.3 Flash (Vision)",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "videoInput": true,
        "pdf": true,
        "reasoning": true,
        "thinkingFormat": "zai",
        "thinkingCanDisable": false,
        "contextWindow": 1000000,
        "maxOutput": 131072
      }
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false,
      "capabilities": {
        "reasoning": true,
        "thinkingFormat": "zai",
        "thinkingCanDisable": false,
        "contextWindow": 1000000,
        "maxOutput": 131072
      }
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
      "name": "GLM 4.7",
      "isDefault": false
    },
    {
      "id": "glm-4.6v",
      "name": "GLM 4.6V (Vision)",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "videoInput": true,
        "reasoning": true,
        "thinkingFormat": "zai",
        "contextWindow": 128000,
        "maxOutput": 32768
      }
    }
  ]
};

export const provider = metadata;
export default metadata;
