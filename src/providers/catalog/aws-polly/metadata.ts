import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "aws-polly",
  "name": "AWS Polly",
  "alias": "polly",
  "color": "#FF9900",
  "image": "/assets/providers/aws-polly/icon.png",
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

export const provider = metadata;
export default metadata;
