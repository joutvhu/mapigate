import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Session",
      "Weekly",
      "Monthly",
      "Credits"
  ],
  "id": "kiro",
  "name": "Kiro AI",
  "alias": "kr",
  "uiAlias": "kr",
  "color": "#FF6B35",
  "iconBg": "#9046ff",
  "image": "/assets/providers/kiro/icon.png",
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
  }
,
  models
};

export const provider = metadata;
export default metadata;
