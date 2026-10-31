import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Session",
      "Weekly",
      "Requests",
      "Tokens",
      "Balance"
  ],
  "id": "grok",
  "name": "xAI Grok",
  "alias": "grok",
  "color": "#1DA1F2",
  "image": "/assets/providers/grok/icon.svg",
  "website": "https://x.ai",
  "notice": {
    "apiKeyUrl": "https://console.x.ai"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api.x.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.x.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.x.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "grok-4.7",
      "name": "Grok 4.7",
      "isDefault": false
    },
    {
      "id": "grok-4.6",
      "name": "Grok 4.6",
      "isDefault": false
    },
    {
      "id": "grok-4.5",
      "name": "Grok 4.5",
      "isDefault": false
    },
    {
      "id": "grok-4",
      "name": "Grok 4",
      "isDefault": false
    },
    {
      "id": "grok-4-fast-reasoning",
      "name": "Grok 4 Fast Reasoning",
      "isDefault": false
    },
    {
      "id": "grok-code-fast-1",
      "name": "Grok Code Fast",
      "isDefault": false
    },
    {
      "id": "grok-3",
      "name": "Grok 3",
      "isDefault": false
    },
    {
      "id": "grok-2-image-1212",
      "name": "Grok 2 Image",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "grok-imagine-video",
      "name": "Grok Imagine Video",
      "isDefault": false,
      "kind": "video"
    }
  ],
  "aliases": [
    "grok",
    "xai"
  ],
  "oauth": {
    "clientId": "b1a00492-073a-47ea-816f-4c329264a828",
    "deviceCodeUrl": "https://auth.x.ai/oauth2/device/code",
    "tokenUrl": "https://auth.x.ai/oauth2/token",
    "refreshUrl": "https://auth.x.ai/oauth2/token",
    "scope": "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write",
    "referrer": "grok-build"
  },
  "uiAlias": "grok"
};

export const provider = metadata;
export default metadata;
