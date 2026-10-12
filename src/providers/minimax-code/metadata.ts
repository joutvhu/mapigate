import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "minimax-code",
  "name": "MiniMax Code",
  "alias": "mm",
  "color": "#FF4D4F",
  "image": "/assets/providers/minimax-code/icon.png",
  "website": "https://agent.minimax.cn",
  "category": "oauth",
  "authModes": [
    "oauth"
  ],
  "baseUrl": "https://agent.minimax.cn/mavis/api/v1/llm/v1/messages",
  "baseUrls": [
    "https://agent.minimax.cn/mavis/api/v1/llm/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "User-Agent": "MiniMaxAgent",
    "X-Mavis-Agent-Id": "main"
  },
  "thinkingMode": "auto",
  "oauth": {
    "clientId": "mcode-public",
    "deviceUrl": "https://account.minimax.cn/oauth2/device/code",
    "tokenUrl": "https://account.minimax.cn/oauth2/token",
    "scope": "agent.default",
    "audience": "agent-backend",
    "refreshLeadMs": 600000,
    "scopes": [
      "agent.default"
    ]
  },
  "models": [
    {
      "id": "MiniMax-M3.1-Flash-Preview",
      "name": "MiniMax M3.1 Flash Preview",
      "isDefault": false
    },
    {
      "id": "MiniMax-M3",
      "name": "MiniMax M3",
      "isDefault": false
    },
    {
      "id": "MiniMax-M2.7",
      "name": "MiniMax M2.7",
      "isDefault": false
    },
    {
      "id": "MiniMax-M2.7-highspeed",
      "name": "MiniMax M2.7 Highspeed",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
