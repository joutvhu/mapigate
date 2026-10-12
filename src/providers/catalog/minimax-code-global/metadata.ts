import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "minimax-code-global",
  "name": "MiniMax Code (Global)",
  "alias": "mmg",
  "color": "#FF4D4F",
  "image": "/assets/providers/minimax-code-global/icon.png",
  "website": "https://agent.minimax.io",
  "category": "oauth",
  "authModes": [
    "oauth"
  ],
  "baseUrl": "https://agent.minimax.io/mavis/api/v1/llm/v1/messages",
  "baseUrls": [
    "https://agent.minimax.io/mavis/api/v1/llm/v1/messages"
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
    "deviceUrl": "https://account.minimax.io/oauth2/device/code",
    "tokenUrl": "https://account.minimax.io/oauth2/token",
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
