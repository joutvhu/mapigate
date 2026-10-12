import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Session",
      "Weekly",
      "Requests",
      "Tokens",
      "Balance"
  ],
  "id": "grok-cli",
  "name": "Grok CLI (Grok Build)",
  "alias": "gcli",
  "aliases": [
    "grok-build",
    "gb"
  ],
  "uiAlias": "gcli",
  "color": "#1DA1F2",
  "iconBg": "#ffffff",
  "image": "/assets/providers/grok-cli/icon.png",
  "website": "https://x.ai",
  "notice": {
    "text": "Sign in with your xAI / Grok account via device code. Uses Grok Build subscription credits (cli-chat-proxy.grok.com).",
    "signupUrl": "https://grok.com/supergrok"
  },
  "category": "oauth",
  "authModes": [
    "oauth"
  ],
  "baseUrl": "https://cli-chat-proxy.grok.com/v1/responses",
  "baseUrls": [
    "https://cli-chat-proxy.grok.com/v1/responses"
  ],
  "validateUrl": "",
  "format": "openai-responses",
  "defaultHeaders": {
    "User-Agent": "grok-shell/1.0.44 (linux; x86_64)",
    "x-grok-client-identifier": "grok-shell",
    "x-grok-client-version": "1.0.44"
  },
  "thinkingMode": "high",
  "thinkingOptions": [
    "low",
    "medium",
    "high",
    "xhigh"
  ],
  "oauth": {
    "clientId": "b1a00492-073a-47ea-816f-4c329264a828",
    "deviceCodeUrl": "https://auth.x.ai/oauth2/device/code",
    "tokenUrl": "https://auth.x.ai/oauth2/token",
    "refreshUrl": "https://auth.x.ai/oauth2/token",
    "scope": "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write",
    "referrer": "grok-build",
    "refreshLeadMs": 300000,
    "scopes": [
      "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write"
    ]
  },
  "models": [
    {
      "id": "grok-build",
      "name": "Grok Build",
      "isDefault": false,
      "contextLength": 500000
    },
    {
      "id": "grok-4.5",
      "name": "Grok 4.5",
      "isDefault": false
    },
    {
      "id": "grok-4.5-high",
      "name": "Grok 4.5 (High)",
      "upstreamModelId": "grok-4.5",
      "isDefault": false
    },
    {
      "id": "grok-4.5-medium",
      "name": "Grok 4.5 (Medium)",
      "upstreamModelId": "grok-4.5",
      "isDefault": false
    },
    {
      "id": "grok-4.5-low",
      "name": "Grok 4.5 (Low)",
      "upstreamModelId": "grok-4.5",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
