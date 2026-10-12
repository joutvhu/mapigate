import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "codex-app-server",
  "name": "OpenAI Codex (App-Server)",
  "alias": "cxa",
  "aliases": [
    "codex-app-server",
    "cxa"
  ],
  "uiAlias": "cxa",
  "color": "#10A37F",
  "image": "/assets/providers/codex-app-server/icon.png",
  "website": "https://developers.openai.com/codex/cli",
  "notice": {
    "text": "OpenAI Codex CLI app-server transport over JSON-RPC / WebSocket."
  },
  "category": "oauth",
  "authType": "oauth",
  "baseUrl": "codex-app-server://cli/websocket",
  "baseUrls": [
    "codex-app-server://cli/websocket"
  ],
  "validateUrl": "",
  "format": "openai-responses",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "gpt-5.5-codex",
      "name": "GPT 5.5 Codex",
      "isDefault": true,
      "contextLength": 400000
    },
    {
      "id": "codex-pro",
      "name": "Codex Pro",
      "isDefault": false,
      "contextLength": 400000
    },
    {
      "id": "gpt-6-astra",
      "name": "GPT 6.0 Astra",
      "isDefault": false,
      "contextLength": 872000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
