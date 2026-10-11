import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "arcee-ai",
  "name": "Arcee AI",
  "alias": "arcee",
  "aliases": [
    "arcee-ai"
  ],
  "uiAlias": "arcee-ai",
  "color": "#8B5CF6",
  "image": "/providers/arcee-ai.svg",
  "website": "https://arcee.ai",
  "notice": {
    "apiKeyUrl": "",
    "text": "Arcee AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.arcee.ai/api/v1/chat/completions",
  "baseUrls": [
    "https://api.arcee.ai/api/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "arcee-ai-default",
      "name": "Arcee AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
