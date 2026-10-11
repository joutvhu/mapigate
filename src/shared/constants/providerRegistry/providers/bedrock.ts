import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "bedrock",
  "name": "AWS Bedrock",
  "alias": "br",
  "aliases": [
    "aws-bedrock"
  ],
  "uiAlias": "br",
  "color": "#FF9900",
  "image": "/providers/bedrock.png",
  "website": "https://aws.amazon.com/bedrock/",
  "notice": {
    "text": "Two ways to authenticate, both entered in the AWS Bedrock Credentials section below. SSO / profile (recommended): fill in Profile and Region, leave the API key empty, then run `aws sso login --profile <name>` — credentials refresh automatically. Static keys: put the AWS secret access key in the API Key field and the key id in Access Key ID, adding Session Token if they are temporary (ASIA…) keys. A profile, if set, takes precedence over static keys.",
    "apiKeyUrl": "https://console.aws.amazon.com/iam/home#/security_credentials"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://bedrock-runtime.{region}.amazonaws.com",
  "baseUrls": [
    "https://bedrock-runtime.{region}.amazonaws.com"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "credentialForm": "aws",
  "apiKeyOptionalWith": "profile",
  "hasProviderSpecificData": true,
  "models": [
    {
      "id": "us.anthropic.claude-opus-5",
      "name": "Claude Opus 5",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-fable-5",
      "name": "Claude Fable 5",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-opus-4-8",
      "name": "Claude Opus 4.8",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-opus-4-7",
      "name": "Claude Opus 4.7",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-opus-4-5-20251101-v1:0",
      "name": "Claude Opus 4.5",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      "name": "Claude Sonnet 4.5",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-opus-4-1-20250805-v1:0",
      "name": "Claude Opus 4.1",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
      "name": "Claude Sonnet 4",
      "isDefault": false
    },
    {
      "id": "us.anthropic.claude-3-haiku-20240307-v1:0",
      "name": "Claude 3 Haiku",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export default provider;
