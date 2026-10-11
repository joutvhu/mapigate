import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "amazon-q",
  "name": "Amazon Q Developer",
  "alias": "aq",
  "aliases": [
    "amazon-q",
    "aq"
  ],
  "uiAlias": "aq",
  "color": "#FF9900",
  "image": "/providers/kiro.png",
  "website": "https://aws.amazon.com/q/developer/",
  "notice": {
    "signupUrl": "https://aws.amazon.com/q/developer/",
    "text": "Amazon Q Developer using AWS Builder ID OAuth session."
  },
  "category": "oauth",
  "authType": "oauth",
  "baseUrl": "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
  "baseUrls": [
    "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
    "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse"
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
    "clientName": "amazon-q-client",
    "clientType": "public",
    "scopes": [
      "codewhisperer:completions",
      "codewhisperer:analysis",
      "codewhisperer:conversations"
    ],
    "grantTypes": [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token"
    ]
  },
  "models": [
    {
      "id": "amazon-q-developer",
      "name": "Amazon Q Developer",
      "isDefault": true,
      "contextLength": 200000
    },
    {
      "id": "claude-3-7-sonnet",
      "name": "Claude 3.7 Sonnet (Amazon Q)",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-3-5-sonnet",
      "name": "Claude 3.5 Sonnet (Amazon Q)",
      "isDefault": false,
      "contextLength": 200000
    }
  ],
  "passthroughModels": true
};

export default provider;
