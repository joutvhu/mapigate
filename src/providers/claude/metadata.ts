import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "claude",
  "name": "Claude Code",
  "alias": "cc",
  "uiAlias": "cc",
  "color": "#D97757",
  "image": "/assets/providers/claude/icon.png",
  "website": "https://claude.ai",
  "notice": {
    "signupUrl": "https://claude.ai"
  },
  "deprecated": true,
  "deprecationNotice": "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.",
  "category": "oauth",
  "baseUrl": "https://api.anthropic.com/v1/messages",
  "baseUrls": [
    "https://api.anthropic.com/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "Anthropic-Version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advanced-tool-use-2025-11-20,effort-2025-11-24,structured-outputs-2025-12-15,fast-mode-2026-02-01,redact-thinking-2026-02-12,token-efficient-tools-2026-03-28",
    "Anthropic-Dangerous-Direct-Browser-Access": "true",
    "User-Agent": "claude-cli/2.1.280 (external, sdk-cli)",
    "X-App": "cli",
    "X-Stainless-Helper-Method": "stream",
    "X-Stainless-Retry-Count": "0",
    "X-Stainless-Runtime-Version": "v24.14.0",
    "X-Stainless-Package-Version": "0.80.0",
    "X-Stainless-Runtime": "node",
    "X-Stainless-Lang": "js",
    "X-Stainless-Arch": "arm64",
    "X-Stainless-Os": "MacOS",
    "X-Stainless-Timeout": "600"
  },
  "thinkingMode": "auto",
  "oauth": {
    "clientId": "REDACTED_CLAUDE_CLIENT_ID",
    "authorizeUrl": "https://claude.ai/oauth/authorize",
    "tokenUrl": "https://api.anthropic.com/v1/oauth/token",
    "scopes": [
      "org:create_api_key",
      "user:profile",
      "user:inference"
    ],
    "codeChallengeMethod": "S256",
    "refreshLeadMs": 14400000,
    "refresh": {
      "encoding": "json"
    }
  },
  "models": [
    {
      "id": "claude-opus-5-5",
      "name": "Claude Opus 5.5",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-adaptive",
        "contextWindow": 1000000,
        "maxOutput": 128000,
        "thinkingCanDisable": false
      }
    },
    {
      "id": "claude-opus-5",
      "name": "Claude Opus 5",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-adaptive",
        "contextWindow": 1000000,
        "maxOutput": 128000
      }
    },
    {
      "id": "claude-fable-5-1",
      "name": "Claude Fable 5.1",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-adaptive",
        "thinkingCanDisable": false,
        "contextWindow": 1000000,
        "maxOutput": 128000
      }
    },
    {
      "id": "claude-fable-5",
      "name": "Claude Fable 5",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-5-5",
      "name": "Claude Sonnet 5.5",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-adaptive",
        "contextWindow": 1000000,
        "maxOutput": 128000
      }
    },
    {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-adaptive",
        "contextWindow": 1000000,
        "maxOutput": 128000
      }
    },
    {
      "id": "claude-3-7-sonnet",
      "name": "Claude 3.7 Sonnet",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "search": true,
        "thinkingFormat": "claude-budget",
        "contextWindow": 200000,
        "maxOutput": 64000
      }
    },
    {
      "id": "claude-haiku-4-5-20251001",
      "name": "Claude 4.5 Haiku",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
