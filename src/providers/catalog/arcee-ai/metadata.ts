import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "arcee-ai",
  "name": "Arcee AI",
  "alias": "arcee",
  "aliases": [
    "arcee-ai"
  ],
  "uiAlias": "arcee-ai",
  "color": "#8B5CF6",
  "image": "/assets/providers/arcee-ai/icon.svg",
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

export const provider = metadata;
export default metadata;
