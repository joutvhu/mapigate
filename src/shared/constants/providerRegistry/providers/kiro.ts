import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "kiro",
  "name": "Kiro AI",
  "alias": "kr",
  "uiAlias": "kr",
  "color": "#FF6B35",
  "image": "/providers/kiro.png",
  "website": "https://kiro.dev",
  "notice": {
    "signupUrl": "https://kiro.dev"
  },
  "deprecated": true,
  "deprecationNotice": "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.",
  "category": "free",
  "baseUrl": "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
  "baseUrls": [
    "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
    "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
    "https://q.us-east-1.amazonaws.com/generateAssistantResponse"
  ],
  "validateUrl": "",
  "format": "kiro",
  "defaultHeaders": {
    "Content-Type": "application/json",
    "Accept": "application/vnd.amazon.eventstream",
    "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
    "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0"
  },
  "thinkingMode": "auto",
  "oauth": {
    "ssoOidcEndpoint": "https://oidc.us-east-1.amazonaws.com",
    "registerClientUrl": "https://oidc.us-east-1.amazonaws.com/client/register",
    "deviceAuthUrl": "https://oidc.us-east-1.amazonaws.com/device_authorization",
    "tokenUrl": "https://oidc.us-east-1.amazonaws.com/token",
    "startUrl": "https://view.awsapps.com/start",
    "clientName": "kiro-oauth-client",
    "clientType": "public",
    "scopes": [
      "codewhisperer:completions",
      "codewhisperer:analysis",
      "codewhisperer:conversations"
    ],
    "grantTypes": [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token"
    ],
    "issuerUrl": "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6",
    "socialAuthEndpoint": "https://prod.us-east-1.auth.desktop.kiro.dev",
    "socialLoginUrl": "https://prod.us-east-1.auth.desktop.kiro.dev/login",
    "socialTokenUrl": "https://prod.us-east-1.auth.desktop.kiro.dev/oauth/token",
    "socialRefreshUrl": "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
    "authMethods": [
      "builder-id",
      "idc",
      "google",
      "github",
      "import"
    ]
  },
  "models": [
    {
      "id": "claude-opus-5.5",
      "name": "Claude Opus 5.5",
      "isDefault": false
    },
    {
      "id": "claude-opus-5.5-thinking",
      "name": "Claude Opus 5.5 (Thinking)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5.5-agentic",
      "name": "Claude Opus 5.5 (Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5.5-thinking-agentic",
      "name": "Claude Opus 5.5 (Thinking + Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5",
      "name": "Claude Opus 5",
      "isDefault": false
    },
    {
      "id": "claude-opus-5-thinking",
      "name": "Claude Opus 5 (Thinking)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5-agentic",
      "name": "Claude Opus 5 (Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5-thinking-agentic",
      "name": "Claude Opus 5 (Thinking + Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.8",
      "name": "Claude Opus 4.8",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.8-thinking",
      "name": "Claude Opus 4.8 (Thinking)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.8-agentic",
      "name": "Claude Opus 4.8 (Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.8-thinking-agentic",
      "name": "Claude Opus 4.8 (Thinking + Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.7",
      "name": "Claude Opus 4.7",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.7-thinking",
      "name": "Claude Opus 4.7 (Thinking)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.7-agentic",
      "name": "Claude Opus 4.7 (Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.7-thinking-agentic",
      "name": "Claude Opus 4.7 (Thinking + Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.5",
      "name": "Claude Opus 4.5",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.5-thinking",
      "name": "Claude Opus 4.5 (Thinking)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.5-agentic",
      "name": "Claude Opus 4.5 (Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.5-thinking-agentic",
      "name": "Claude Opus 4.5 (Thinking + Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4.5",
      "name": "Claude Sonnet 4.5",
      "isDefault": false
    },
    {
      "id": "claude-haiku-4.5",
      "name": "Claude Haiku 4.5",
      "isDefault": false
    },
    {
      "id": "deepseek-3.2",
      "name": "DeepSeek 3.2",
      "isDefault": false
    },
    {
      "id": "qwen3-coder-next",
      "name": "Qwen3 Coder Next",
      "isDefault": false
    },
    {
      "id": "glm-5",
      "name": "GLM 5",
      "isDefault": false
    },
    {
      "id": "MiniMax-M2.5",
      "name": "MiniMax M2.5",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-sol",
      "name": "GPT 5.6 Sol",
      "upstreamModelId": "gpt-5.6-sol",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "gpt-5.6-terra",
      "name": "GPT 5.6 Terra",
      "upstreamModelId": "gpt-5.6-terra",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "gpt-5.6-luna",
      "name": "GPT 5.6 Luna",
      "upstreamModelId": "gpt-5.6-luna",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "claude-sonnet-5-thinking",
      "name": "Claude Sonnet 5 (Thinking)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4.5-thinking",
      "name": "Claude Sonnet 4.5 (Thinking)",
      "isDefault": false
    },
    {
      "id": "claude-haiku-4.5-thinking",
      "name": "Claude Haiku 4.5 (Thinking)",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-sol-thinking",
      "name": "GPT 5.6 Sol (Thinking)",
      "upstreamModelId": "gpt-5.6-sol",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "gpt-5.6-terra-thinking",
      "name": "GPT 5.6 Terra (Thinking)",
      "upstreamModelId": "gpt-5.6-terra",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "gpt-5.6-luna-thinking",
      "name": "GPT 5.6 Luna (Thinking)",
      "upstreamModelId": "gpt-5.6-luna",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "claude-sonnet-5-agentic",
      "name": "Claude Sonnet 5 (Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4.5-agentic",
      "name": "Claude Sonnet 4.5 (Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-haiku-4.5-agentic",
      "name": "Claude Haiku 4.5 (Agentic)",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-sol-agentic",
      "name": "GPT 5.6 Sol (Agentic)",
      "upstreamModelId": "gpt-5.6-sol",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "gpt-5.6-terra-agentic",
      "name": "GPT 5.6 Terra (Agentic)",
      "upstreamModelId": "gpt-5.6-terra",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "gpt-5.6-luna-agentic",
      "name": "GPT 5.6 Luna (Agentic)",
      "upstreamModelId": "gpt-5.6-luna",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "claude-sonnet-5-thinking-agentic",
      "name": "Claude Sonnet 5 (Thinking + Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4.5-thinking-agentic",
      "name": "Claude Sonnet 4.5 (Thinking + Agentic)",
      "isDefault": false
    },
    {
      "id": "claude-haiku-4.5-thinking-agentic",
      "name": "Claude Haiku 4.5 (Thinking + Agentic)",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-sol-thinking-agentic",
      "name": "GPT 5.6 Sol (Thinking + Agentic)",
      "upstreamModelId": "gpt-5.6-sol",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "gpt-5.6-terra-thinking-agentic",
      "name": "GPT 5.6 Terra (Thinking + Agentic)",
      "upstreamModelId": "gpt-5.6-terra",
      "isDefault": false,
      "contextLength": 272000
    },
    {
      "id": "gpt-5.6-luna-thinking-agentic",
      "name": "GPT 5.6 Luna (Thinking + Agentic)",
      "upstreamModelId": "gpt-5.6-luna",
      "isDefault": false,
      "contextLength": 272000
    }
  ]
};

export default provider;
