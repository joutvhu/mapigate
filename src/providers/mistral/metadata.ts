import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "mistral",
  "name": "Mistral",
  "alias": "mistral",
  "color": "#FF7000",
  "image": "/assets/providers/mistral/icon.png",
  "website": "https://mistral.ai",
  "notice": {
    "apiKeyUrl": "https://console.mistral.ai/api-keys"
  },
  "category": "apikey",
  "baseUrl": "https://api.mistral.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.mistral.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.mistral.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "mistral-large-latest",
      "name": "Mistral Large 3",
      "isDefault": false
    },
    {
      "id": "codestral-latest",
      "name": "Codestral",
      "isDefault": false
    },
    {
      "id": "mistral-medium-latest",
      "name": "Mistral Medium 3",
      "isDefault": false
    },
    {
      "id": "mistral-embed",
      "name": "Mistral Embed",
      "isDefault": false,
      "kind": "embedding"
    }
  ]
};

export const provider = metadata;
export default metadata;
