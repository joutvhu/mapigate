import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "cursor",
  "name": "Cursor IDE",
  "alias": "cu",
  "uiAlias": "cu",
  "color": "#00D4AA",
  "image": "/providers/cursor.png",
  "website": "https://cursor.com",
  "notice": {
    "signupUrl": "https://cursor.com"
  },
  "category": "oauth",
  "baseUrl": "https://api2.cursor.sh",
  "baseUrls": [
    "https://api2.cursor.sh"
  ],
  "validateUrl": "",
  "format": "cursor",
  "defaultHeaders": {
    "connect-accept-encoding": "gzip",
    "connect-protocol-version": "1",
    "Content-Type": "application/connect+proto",
    "User-Agent": "connect-es/1.6.1"
  },
  "thinkingMode": "auto",
  "oauth": {
    "apiEndpoint": "https://api2.cursor.sh",
    "chatEndpoint": "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    "modelsEndpoint": "/agent.v1.AgentService/GetUsableModels",
    "api3Endpoint": "https://api3.cursor.sh",
    "agentEndpoint": "https://agent.api5.cursor.sh",
    "agentNonPrivacyEndpoint": "https://agentn.api5.cursor.sh",
    "clientVersion": "3.12.17",
    "clientType": "ide",
    "dbKeys": {
      "accessToken": "cursorAuth/accessToken",
      "machineId": "storage.serviceMachineId"
    }
  },
  "models": [
    {
      "id": "default",
      "name": "Auto (Server Picks)",
      "isDefault": false
    },
    {
      "id": "claude-4.5-opus-high-thinking",
      "name": "Claude 4.5 Opus High Thinking",
      "isDefault": false
    },
    {
      "id": "claude-4.5-opus-high",
      "name": "Claude 4.5 Opus High",
      "isDefault": false
    },
    {
      "id": "claude-4.5-sonnet-thinking",
      "name": "Claude 4.5 Sonnet Thinking",
      "isDefault": false
    },
    {
      "id": "claude-4.5-sonnet",
      "name": "Claude 4.5 Sonnet",
      "isDefault": false
    },
    {
      "id": "claude-4.5-haiku",
      "name": "Claude 4.5 Haiku",
      "isDefault": false
    },
    {
      "id": "claude-4.5-opus",
      "name": "Claude 4.5 Opus",
      "isDefault": false
    },
    {
      "id": "gpt-5.2-codex",
      "name": "GPT 5.2 Codex",
      "isDefault": false
    },
    {
      "id": "claude-4.6-opus-max",
      "name": "Claude 4.6 Opus Max",
      "isDefault": false
    },
    {
      "id": "claude-4.6-sonnet-medium-thinking",
      "name": "Claude 4.6 Sonnet Medium Thinking",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "isDefault": false
    },
    {
      "id": "gemini-3-flash-preview",
      "name": "Gemini 3 Flash Preview",
      "isDefault": false
    },
    {
      "id": "gpt-5.2",
      "name": "GPT 5.2",
      "isDefault": false
    },
    {
      "id": "gpt-5.3-codex",
      "name": "GPT 5.3 Codex",
      "isDefault": false
    }
  ]
};

export default provider;
