import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "bedrock",
  "name": "AWS Bedrock",
  "alias": "br",
  "aliases": [
    "aws-bedrock"
  ],
  "uiAlias": "br",
  "color": "#FF9900",
  "image": "/assets/providers/bedrock/icon.png",
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
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
