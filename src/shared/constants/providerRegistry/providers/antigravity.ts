import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "antigravity",
  "name": "Antigravity",
  "alias": "ag",
  "uiAlias": "ag",
  "color": "#F59E0B",
  "image": "/providers/antigravity.png",
  "website": "https://antigravity.google",
  "notice": {
    "signupUrl": "https://antigravity.google"
  },
  "deprecated": true,
  "deprecationNotice": "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.",
  "category": "oauth",
  "baseUrl": "https://daily-cloudcode-pa.googleapis.com",
  "baseUrls": [
    "https://daily-cloudcode-pa.googleapis.com"
  ],
  "validateUrl": "",
  "format": "antigravity",
  "defaultHeaders": {
    "User-Agent": "antigravity/ide/2.11.0 darwin/arm64"
  },
  "thinkingMode": "auto",
  "oauth": {
    "authorizeUrl": "https://accounts.google.com/o/oauth2/v2/auth",
    "tokenUrl": "https://oauth2.googleapis.com/token",
    "userInfoUrl": "https://www.googleapis.com/oauth2/v1/userinfo",
    "scopes": [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs"
    ],
    "apiEndpoint": "https://daily-cloudcode-pa.googleapis.com",
    "apiVersion": "v1internal",
    "loadCodeAssistEndpoint": "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    "onboardUserEndpoint": "https://cloudcode-pa.googleapis.com/v1internal:onboardUser",
    "loadCodeAssistUserAgent": "antigravity/ide/2.11.0 darwin/arm64",
    "refreshLeadMs": 300000
  },
  "models": [
    {
      "id": "gemini-3.8-flash-high",
      "name": "Gemini 3.8 Flash (High)",
      "upstreamModelId": "gemini-3.8-flash-high(high)",
      "isDefault": false
    },
    {
      "id": "gemini-3.8-flash-medium",
      "name": "Gemini 3.8 Flash (Medium)",
      "upstreamModelId": "gemini-3.8-flash-medium(medium)",
      "isDefault": false
    },
    {
      "id": "gemini-3.8-flash-low",
      "name": "Gemini 3.8 Flash (Low)",
      "upstreamModelId": "gemini-3.8-flash-low(low)",
      "isDefault": false
    },
    {
      "id": "gemini-3.8-flash",
      "name": "Gemini 3.8 Flash",
      "upstreamModelId": "gemini-3.8-flash-medium(medium)",
      "isDefault": false
    },
    {
      "id": "gemini-3.7-flash-high",
      "name": "Gemini 3.7 Flash (High)",
      "upstreamModelId": "gemini-3.7-flash-tiered(high)",
      "isDefault": false
    },
    {
      "id": "gemini-3.7-flash-medium",
      "name": "Gemini 3.7 Flash (Medium)",
      "upstreamModelId": "gemini-3.7-flash-tiered(medium)",
      "isDefault": false
    },
    {
      "id": "gemini-3.7-flash-low",
      "name": "Gemini 3.7 Flash (Low)",
      "upstreamModelId": "gemini-3.7-flash-tiered(low)",
      "isDefault": false
    },
    {
      "id": "gemini-3.6-flash-high",
      "name": "Gemini 3.6 Flash (High)",
      "upstreamModelId": "gemini-3.6-flash-tiered(high)",
      "isDefault": false
    },
    {
      "id": "gemini-3.6-flash-medium",
      "name": "Gemini 3.6 Flash (Medium)",
      "upstreamModelId": "gemini-3.6-flash-tiered(medium)",
      "isDefault": false
    },
    {
      "id": "gemini-3.6-flash-low",
      "name": "Gemini 3.6 Flash (Low)",
      "upstreamModelId": "gemini-3.6-flash-tiered(low)",
      "isDefault": false
    },
    {
      "id": "gemini-3.1-pro-high",
      "name": "Gemini 3.1 Pro (High)",
      "upstreamModelId": "gemini-pro-agent",
      "isDefault": false
    },
    {
      "id": "gemini-pro-agent",
      "name": "Gemini 3.1 Pro (High)",
      "upstreamModelId": "gemini-pro-agent",
      "isDefault": false
    },
    {
      "id": "gemini-3.1-pro-low",
      "name": "Gemini 3.1 Pro (Low)",
      "upstreamModelId": "gemini-3.1-pro-low(low)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-5-5-high",
      "name": "Claude Sonnet 5.5 (High)",
      "upstreamModelId": "claude-sonnet-5-5-high(high)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-5-5-medium",
      "name": "Claude Sonnet 5.5 (Medium)",
      "upstreamModelId": "claude-sonnet-5-5-medium(medium)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-5-5-low",
      "name": "Claude Sonnet 5.5 (Low)",
      "upstreamModelId": "claude-sonnet-5-5-low(low)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-5-5",
      "name": "Claude Sonnet 5.5 (Thinking)",
      "upstreamModelId": "claude-sonnet-5-5-high(high)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5-5-high",
      "name": "Claude Opus 5.5 (High)",
      "upstreamModelId": "claude-opus-5-5-high(high)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5-5-medium",
      "name": "Claude Opus 5.5 (Medium)",
      "upstreamModelId": "claude-opus-5-5-medium(medium)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5-5-low",
      "name": "Claude Opus 5.5 (Low)",
      "upstreamModelId": "claude-opus-5-5-low(low)",
      "isDefault": false
    },
    {
      "id": "claude-opus-5-5",
      "name": "Claude Opus 5.5 (Thinking)",
      "upstreamModelId": "claude-opus-5-5-high(high)",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6 (Thinking)",
      "isDefault": false
    },
    {
      "id": "claude-opus-4-6-thinking",
      "name": "Claude Opus 4.6 (Thinking)",
      "isDefault": false
    },
    {
      "id": "gpt-oss-120b-medium",
      "name": "GPT-OSS 120B (Medium)",
      "isDefault": false
    },
    {
      "id": "gemini-3.1-flash-image",
      "name": "Gemini 3.1 Flash (Image)",
      "isDefault": false,
      "capabilities": [
        "textToImage"
      ],
      "kind": "image"
    }
  ]
};

export default provider;
