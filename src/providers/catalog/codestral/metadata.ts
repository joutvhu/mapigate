import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "codestral",
  "name": "Codestral",
  "alias": "codestral",
  "aliases": [
    "codestral"
  ],
  "uiAlias": "codestral",
  "color": "#F59E0B",
  "image": "/assets/providers/codestral/icon.png",
  "website": "https://mistral.ai",
  "notice": {
    "apiKeyUrl": "https://console.mistral.ai/api-keys/",
    "text": "Mistral AI specialized endpoint for code generation and Fill-in-the-Middle (FIM)."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://codestral.mistral.ai/v1/chat/completions",
  "baseUrls": [
    "https://codestral.mistral.ai/v1/chat/completions"
  ],
  "validateUrl": "https://codestral.mistral.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "codestral-latest",
      "name": "Codestral Latest",
      "isDefault": true,
      "contextLength": 256000
    },
    {
      "id": "codestral-2508",
      "name": "Codestral 2508",
      "isDefault": false,
      "contextLength": 256000
    },
    {
      "id": "codestral-2501",
      "name": "Codestral 2501",
      "isDefault": false,
      "contextLength": 256000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
