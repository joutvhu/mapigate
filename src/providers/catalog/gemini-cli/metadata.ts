import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Requests (RPM)",
      "Requests (Daily)",
      "Tokens (TPM)",
      "Tokens (Daily)"
  ],
  "id": "gemini-cli",
  "name": "Gemini CLI",
  "alias": "gc",
  "uiAlias": "gc",
  "color": "#4285F4",
  "image": "/assets/providers/gemini-cli/icon.png",
  "website": "https://github.com/google-gemini/gemini-cli",
  "notice": {
    "signupUrl": "https://github.com/google-gemini/gemini-cli"
  },
  "deprecated": true,
  "deprecationNotice": "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.",
  "category": "free",
  "baseUrl": "https://cloudcode-pa.googleapis.com/v1internal",
  "baseUrls": [
    "https://cloudcode-pa.googleapis.com/v1internal"
  ],
  "validateUrl": "",
  "format": "gemini-cli",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "oauth": {
    "authorizeUrl": "https://accounts.google.com/o/oauth2/v2/auth",
    "tokenUrl": "https://oauth2.googleapis.com/token",
    "userInfoUrl": "https://www.googleapis.com/oauth2/v1/userinfo",
    "scopes": [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ],
    "refresh": {
      "encoding": "form"
    }
  },
  "models": [
    {
      "id": "gemini-3.1-pro-preview",
      "name": "Gemini 3.1 Pro Preview",
      "isDefault": false
    },
    {
      "id": "gemini-3-pro-preview",
      "name": "Gemini 3 Pro Preview",
      "isDefault": false
    },
    {
      "id": "gemini-3-flash-preview",
      "name": "Gemini 3 Flash Preview",
      "isDefault": false
    },
    {
      "id": "gemini-3.1-flash-lite-preview",
      "name": "Gemini 3.1 Flash Lite Preview",
      "isDefault": false
    },
    {
      "id": "gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "isDefault": false
    },
    {
      "id": "gemini-2.5-flash",
      "name": "Gemini 2.5 Flash",
      "isDefault": false
    },
    {
      "id": "gemini-2.5-flash-lite",
      "name": "Gemini 2.5 Flash Lite",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
