import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "mistral",
  "name": "Mistral AI",
  "alias": "mistral",
  "aliases": [
    "mistral",
    "codestral",
    "mistral-ai"
  ],
  "uiAlias": "mistral",
  "color": "#FF7000",
  "iconBg": "#e10500",
  "image": "/assets/providers/mistral/icon.png",
  "website": "https://mistral.ai",
  "notice": {
    "apiKeyUrl": "https://console.mistral.ai/api-keys",
    "text": "Mistral AI unified platform (api.mistral.ai) serving all Mistral and Codestral models via console API keys."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.mistral.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.mistral.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.mistral.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "passthroughModels": true,
  "models": [
    {
      "id": "codestral-latest",
      "name": "Codestral Latest",
      "isDefault": true,
      "contextLength": 256000
    },
    {
      "id": "codestral-2501",
      "name": "Codestral 2501",
      "isDefault": false,
      "contextLength": 256000
    },
    {
      "id": "mistral-large-latest",
      "name": "Mistral Large 3",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "mistral-small-latest",
      "name": "Mistral Small",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "pixtral-large-latest",
      "name": "Pixtral Large",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "ministral-8b-latest",
      "name": "Ministral 8B",
      "isDefault": false,
      "contextLength": 128000
    }
  ]
};

export const provider = metadata;
export default metadata;
