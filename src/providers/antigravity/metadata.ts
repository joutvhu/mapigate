import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "antigravity",
  "name": "Antigravity",
  "alias": "ag",
  "uiAlias": "ag",
  "color": "#F59E0B",
  "image": "/assets/providers/antigravity/icon.png",
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
  }
,
  models
};

export const provider = metadata;
export default metadata;
