import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "github",
  "name": "GitHub Copilot",
  "alias": "gh",
  "uiAlias": "gh",
  "color": "#333333",
  "image": "/providers/github.png",
  "website": "https://github.com/features/copilot",
  "notice": {
    "signupUrl": "https://github.com/features/copilot"
  },
  "deprecated": true,
  "deprecationNotice": "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.",
  "category": "oauth",
  "baseUrl": "https://api.githubcopilot.com/chat/completions",
  "baseUrls": [
    "https://api.githubcopilot.com/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "copilot-integration-id": "vscode-chat",
    "editor-version": "vscode/1.110.0",
    "editor-plugin-version": "copilot-chat/0.38.0",
    "user-agent": "GitHubCopilotChat/0.38.0",
    "openai-intent": "conversation-panel",
    "x-github-api-version": "2025-04-01",
    "x-vscode-user-agent-library-version": "electron-fetch",
    "X-Initiator": "user",
    "Accept": "application/json",
    "Content-Type": "application/json"
  },
  "thinkingMode": "auto",
  "oauth": {
    "clientId": "Iv1.REDACTED_GITHUB_CLIENT_ID",
    "authorizeUrl": "https://github.com/login/oauth/authorize",
    "deviceCodeUrl": "https://github.com/login/device/code",
    "tokenUrl": "https://github.com/login/oauth/access_token",
    "userInfoUrl": "https://api.github.com/user",
    "scopes": [
      "read:user"
    ],
    "apiVersion": "2022-11-28",
    "copilotTokenUrl": "https://api.github.com/copilot_internal/v2/token",
    "userAgent": "GitHubCopilotChat/0.26.7",
    "editorVersion": "vscode/1.85.0",
    "editorPluginVersion": "copilot-chat/0.26.7"
  },
  "models": [
    {
      "id": "gpt-5.2",
      "name": "GPT-5.2",
      "isDefault": false
    },
    {
      "id": "gpt-5.2-codex",
      "name": "GPT-5.2 Codex",
      "isDefault": false
    },
    {
      "id": "gpt-5.3-codex",
      "name": "GPT-5.3 Codex",
      "isDefault": false
    },
    {
      "id": "gpt-5.4",
      "name": "GPT-5.4",
      "isDefault": false
    },
    {
      "id": "gpt-5.4-mini",
      "name": "GPT-5.4 Mini",
      "isDefault": false
    },
    {
      "id": "claude-haiku-4.5",
      "name": "Claude Haiku 4.5",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.5",
      "name": "Claude Opus 4.5",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4.5",
      "name": "Claude Sonnet 4.5",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.6",
      "name": "Claude Opus 4.6",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.7",
      "name": "Claude Opus 4.7",
      "isDefault": false
    },
    {
      "id": "gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "isDefault": false
    },
    {
      "id": "gemini-3-flash-preview",
      "name": "Gemini 3 Flash",
      "isDefault": false
    },
    {
      "id": "gemini-3.1-pro-preview",
      "name": "Gemini 3.1 Pro",
      "isDefault": false
    },
    {
      "id": "grok-code-fast-1",
      "name": "Grok Code Fast 1",
      "isDefault": false
    },
    {
      "id": "oswe-vscode-prime",
      "name": "Raptor Mini",
      "isDefault": false
    },
    {
      "id": "goldeneye-free-auto",
      "name": "GoldenEye",
      "isDefault": false
    },
    {
      "id": "text-embedding-3-small",
      "name": "Text Embedding 3 Small (GitHub)",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "text-embedding-3-large",
      "name": "Text Embedding 3 Large (GitHub)",
      "isDefault": false,
      "kind": "embedding"
    }
  ]
};

export default provider;
