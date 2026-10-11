import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "codex",
  "name": "OpenAI Codex",
  "alias": "cx",
  "uiAlias": "cx",
  "color": "#3B82F6",
  "image": "/providers/codex.png",
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
  },
  "models": [
    {
      "id": "gpt-6.1-sol",
      "name": "GPT 6.1 Sol",
      "isDefault": false
    },
    {
      "id": "gpt-6-astra",
      "name": "GPT 6.0 Astra",
      "isDefault": false
    },
    {
      "id": "gpt-6-astra[1m]",
      "name": "GPT 6.0 Astra (extended context)",
      "upstreamModelId": "gpt-6-astra",
      "isDefault": false
    },
    {
      "id": "gpt-6-sol",
      "name": "GPT 6.0 Sol",
      "isDefault": false
    },
    {
      "id": "gpt-6-sol[1m]",
      "name": "GPT 6.0 Sol (extended context)",
      "upstreamModelId": "gpt-6-sol",
      "isDefault": false
    },
    {
      "id": "gpt-6-luna",
      "name": "GPT 6.0 Luna",
      "isDefault": false
    },
    {
      "id": "gpt-6-luna[1m]",
      "name": "GPT 6.0 Luna (extended context)",
      "upstreamModelId": "gpt-6-luna",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-sol",
      "name": "GPT 5.6 Sol",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-sol[1m]",
      "name": "GPT 5.6 Sol (extended context)",
      "upstreamModelId": "gpt-5.6-sol",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-sol-review",
      "name": "GPT 5.6 Sol Review",
      "upstreamModelId": "gpt-5.6-sol",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-terra",
      "name": "GPT 5.6 Terra",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-terra[1m]",
      "name": "GPT 5.6 Terra (extended context)",
      "upstreamModelId": "gpt-5.6-terra",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-terra-review",
      "name": "GPT 5.6 Terra Review",
      "upstreamModelId": "gpt-5.6-terra",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-luna",
      "name": "GPT 5.6 Luna",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-luna[1m]",
      "name": "GPT 5.6 Luna (extended context)",
      "upstreamModelId": "gpt-5.6-luna",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-luna-review",
      "name": "GPT 5.6 Luna Review",
      "upstreamModelId": "gpt-5.6-luna",
      "isDefault": false
    },
    {
      "id": "gpt-5.5",
      "name": "GPT 5.5",
      "isDefault": false
    },
    {
      "id": "gpt-5.5-review",
      "name": "GPT 5.5 Review",
      "upstreamModelId": "gpt-5.5",
      "isDefault": false
    },
    {
      "id": "gpt-daybreak-blue-latest",
      "name": "GPT Daybreak Blue",
      "isDefault": false
    },
    {
      "id": "gpt-reserve",
      "name": "GPT Reserve",
      "isDefault": false
    },
    {
      "id": "codex-auto-review",
      "name": "Codex Auto Review",
      "upstreamModelId": "codex-auto-review",
      "isDefault": false
    },
    {
      "id": "gpt-image-2.5",
      "name": "GPT Image 2.5",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit",
        "multiImage"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-image-2.5-flare",
      "name": "GPT Image 2.5 Flare",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit",
        "multiImage"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-image-2.5-sunburst",
      "name": "GPT Image 2.5 Sunburst",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit",
        "multiImage"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-image-2",
      "name": "GPT Image 2",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit",
        "multiImage"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-image-1.5",
      "name": "GPT Image 1.5",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit",
        "multiImage"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-5.6-sol-image",
      "name": "GPT 5.6 Sol Image",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-5.6-terra-image",
      "name": "GPT 5.6 Terra Image",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-5.6-luna-image",
      "name": "GPT 5.6 Luna Image",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-5.5-image",
      "name": "GPT 5.5 Image",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit"
      ],
      "kind": "image"
    },
    {
      "id": "gpt-5.3-image",
      "name": "GPT 5.3 Image",
      "isDefault": false,
      "capabilities": [
        "text2img",
        "edit"
      ],
      "kind": "image"
    }
  ]
};

export default provider;
