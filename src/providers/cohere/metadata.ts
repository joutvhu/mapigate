import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "cohere",
  "name": "Cohere",
  "alias": "cohere",
  "color": "#39594D",
  "image": "/assets/providers/cohere/icon.png",
  "website": "https://cohere.com",
  "notice": {
    "apiKeyUrl": "https://dashboard.cohere.com/api-keys"
  },
  "category": "apikey",
  "baseUrl": "https://api.cohere.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.cohere.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.cohere.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "command-r-plus-08-2024",
      "name": "Command R+ (Aug 2024)",
      "isDefault": false
    },
    {
      "id": "command-r-08-2024",
      "name": "Command R (Aug 2024)",
      "isDefault": false
    },
    {
      "id": "command-a-03-2025",
      "name": "Command A (Mar 2025)",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
