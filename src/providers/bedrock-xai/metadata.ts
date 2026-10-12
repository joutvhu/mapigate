import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "bedrock-xai",
  "name": "AWS Bedrock (xAI)",
  "alias": "brx",
  "aliases": [
    "bedrock-grok"
  ],
  "uiAlias": "brx",
  "color": "#FF9900",
  "image": "/assets/providers/bedrock-xai/icon.png",
  "website": "https://aws.amazon.com/bedrock/",
  "notice": {
    "text": "xAI Grok models hosted on AWS Bedrock. Authenticate exactly like the AWS Bedrock provider: fill in Profile and Region and leave the API key empty, then run `aws sso login --profile <name>`; or use static keys with the AWS secret access key as the API key. Note Grok is a reasoning model and spends output budget thinking before it answers — a small max_tokens returns finish_reason \"length\" with empty content, so allow a few thousand tokens.",
    "apiKeyUrl": "https://console.aws.amazon.com/iam/home#/security_credentials"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://bedrock-runtime.{region}.amazonaws.com",
  "baseUrls": [
    "https://bedrock-runtime.{region}.amazonaws.com"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "credentialForm": "aws",
  "apiKeyOptionalWith": "profile",
  "hasProviderSpecificData": true,
  "models": [
    {
      "id": "us.xai.grok-4.6",
      "name": "Grok 4.6",
      "isDefault": false
    },
    {
      "id": "global.xai.grok-4.6",
      "name": "Grok 4.6 (global)",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
