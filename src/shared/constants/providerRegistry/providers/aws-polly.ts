import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "aws-polly",
  "name": "AWS Polly",
  "alias": "polly",
  "color": "#FF9900",
  "image": "/providers/aws-polly.png",
  "website": "https://aws.amazon.com/polly/",
  "notice": {
    "text": "Use AWS Secret Access Key as API key; set providerSpecificData.accessKeyId and optional region.",
    "apiKeyUrl": "https://console.aws.amazon.com/iam/home#/security_credentials"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "hasProviderSpecificData": true,
  "models": []
};

export default provider;
