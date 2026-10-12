import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Session",
      "Weekly",
      "Credits",
      "Balance"
  ],
  "id": "codex",
  "name": "OpenAI Codex",
  "alias": "cx",
  "uiAlias": "cx",
  "color": "#3B82F6",
  "image": "/assets/providers/codex/icon.png",
  "website": "https://chatgpt.com/codex",
  "notice": {
    "signupUrl": "https://chatgpt.com/codex"
  },
  "deprecated": true,
  "deprecationNotice": "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.",
  "category": "oauth",
  "baseUrl": "https://chatgpt.com/backend-api/codex/responses",
  "baseUrls": [
    "https://chatgpt.com/backend-api/codex/responses"
  ],
  "validateUrl": "",
  "format": "openai-responses",
  "defaultHeaders": {
    "originator": "codex_cli_rs",
    "User-Agent": "codex_cli_rs/0.159.0",
    "version": "0.159.0"
  },
  "thinkingMode": "auto",
  "thinkingOptions": [
    "auto",
    "none",
    "low",
    "medium",
    "high"
  ],
  "oauth": {
    "clientId": "REDACTED_CODEX_CLIENT_ID",
    "authorizeUrl": "https://auth.openai.com/oauth/authorize",
    "tokenUrl": "https://auth.openai.com/oauth/token",
    "scope": "openid profile email offline_access",
    "codeChallengeMethod": "S256",
    "fixedPort": 1455,
    "callbackPath": "/auth/callback",
    "extraParams": {
      "id_token_add_organizations": "true",
      "codex_cli_simplified_flow": "true",
      "originator": "codex_cli_rs"
    },
    "refreshLeadMs": 600000,
    "refresh": {
      "encoding": "form",
      "scope": "openid profile email offline_access"
    },
    "maxRefreshAgeMs": 691200000,
    "trackRefreshAt": true,
    "scopes": [
      "openid profile email offline_access"
    ]
  }
,
  models
};

export const provider = metadata;
export default metadata;
