import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "trae",
  "name": "Trae",
  "alias": "tr",
  "aliases": [
    "marscode"
  ],
  "uiAlias": "tr",
  "color": "#FF6A00",
  "image": "/providers/trae.png",
  "website": "https://www.trae.ai",
  "notice": {
    "signupUrl": "https://www.trae.ai"
  },
  "category": "oauth",
  "authType": "oauth",
  "authModes": [
    "oauth"
  ],
  "baseUrl": "https://core-normal.trae.ai/api/remote/v1",
  "baseUrls": [
    "https://core-normal.trae.ai/api/remote/v1"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "X-Trae-Client-Type": "web",
    "X-Preferenced-Language": "en",
    "Referer": "https://solo.trae.ai/"
  },
  "thinkingMode": "auto",
  "defaultRegion": "cn",
  "oauth": {
    "clientId": "REDACTED_TRAE_CLIENT_ID",
    "clientSecret": "-",
    "platform": "trae",
    "pollInterval": 1500,
    "loginGuidanceUrl": "https://api.marscode.com/cloudide/api/v3/trae/GetLoginGuidance",
    "tokenUrl": "https://api.marscode.com/cloudide/api/v3/trae/oauth/ExchangeToken",
    "exchangeTokenUrl": "https://api.marscode.com/cloudide/api/v3/trae/oauth/ExchangeToken",
    "refreshUrl": "https://api.marscode.com/cloudide/api/v3/trae/oauth/ExchangeToken",
    "userInfoUrl": "https://api.marscode.com/cloudide/api/v3/trae/GetUserInfo",
    "refresh": {
      "encoding": "json"
    }
  },
  "models": [
    {
      "id": "auto",
      "name": "Auto (Server Picks)",
      "isDefault": false
    },
    {
      "id": "work",
      "name": "Work (Fast)",
      "isDefault": false
    },
    {
      "id": "gemini-3.1-pro",
      "name": "Gemini 3.1 Pro",
      "isDefault": false
    },
    {
      "id": "gemini-3-flash-solo",
      "name": "Gemini 3 Flash",
      "isDefault": false
    },
    {
      "id": "minimax-m3",
      "name": "MiniMax M3",
      "isDefault": false
    },
    {
      "id": "minimax-m2.7",
      "name": "MiniMax M2.7",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "isDefault": false
    },
    {
      "id": "gpt-5.4",
      "name": "GPT 5.4",
      "isDefault": false
    },
    {
      "id": "gpt-5.2",
      "name": "GPT 5.2",
      "isDefault": false
    }
  ]
};

export default provider;
