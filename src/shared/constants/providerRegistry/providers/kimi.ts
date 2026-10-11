import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "kimi",
  "name": "Kimi",
  "alias": "kimi",
  "aliases": [
    "kimi-coding",
    "kmc"
  ],
  "color": "#1E3A8A",
  "image": "/providers/kimi.png",
  "website": "https://kimi.moonshot.cn",
  "notice": {
    "apiKeyUrl": "https://platform.moonshot.ai/console/api-keys",
    "signupUrl": "https://www.kimi.com/code"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api.kimi.com/coding/v1/messages",
  "baseUrls": [
    "https://api.kimi.com/coding/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "Anthropic-Version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
  },
  "thinkingMode": "auto",
  "oauth": {
    "clientId": "REDACTED_KIMI_CLIENT_ID",
    "deviceCodeUrl": "https://auth.kimi.com/api/oauth/device_authorization",
    "tokenUrl": "https://auth.kimi.com/api/oauth/token",
    "refreshUrl": "https://auth.kimi.com/api/oauth/token",
    "refreshLeadMs": 300000,
    "authorizeDeviceUrl": "https://www.kimi.com/code/authorize_device"
  },
  "models": [
    {
      "id": "kimi-k3",
      "name": "Kimi K3",
      "isDefault": false
    },
    {
      "id": "k3",
      "name": "Kimi K3 (Code)",
      "isDefault": false
    },
    {
      "id": "kimi-for-coding",
      "name": "Kimi for Coding",
      "isDefault": false
    },
    {
      "id": "kimi-for-coding-highspeed",
      "name": "Kimi for Coding Highspeed",
      "isDefault": false
    },
    {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "isDefault": false
    },
    {
      "id": "kimi-k2.7-code-highspeed",
      "name": "Kimi K2.7 Code Highspeed",
      "isDefault": false
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5-thinking",
      "name": "Kimi K2.5 Thinking",
      "isDefault": false
    },
    {
      "id": "kimi-latest",
      "name": "Kimi Latest",
      "isDefault": false
    }
  ]
};

export default provider;
