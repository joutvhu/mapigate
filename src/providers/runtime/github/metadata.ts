import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Chat",
      "Completions",
      "Premium Interactions"
  ],
  "id": "github",
  "name": "GitHub Copilot",
  "alias": "gh",
  "uiAlias": "gh",
  "color": "#333333",
  "image": "/assets/providers/github/icon.png",
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
  }
,
  models
};

export const provider = metadata;
export default metadata;
