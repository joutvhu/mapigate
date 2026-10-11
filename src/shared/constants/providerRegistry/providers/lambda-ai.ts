import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "lambda-ai",
  "name": "Lambda AI",
  "alias": "lambda",
  "aliases": [
    "lambda-ai"
  ],
  "uiAlias": "lambda-ai",
  "color": "#7C3AED",
  "image": "/providers/lambda-ai.svg",
  "website": "https://lambda.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "Lambda AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.lambda.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.lambda.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "lambda-ai-default",
      "name": "Lambda AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
