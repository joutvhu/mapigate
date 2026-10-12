import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "synthetic",
  "name": "Synthetic",
  "alias": "synthetic",
  "aliases": [
    "synthetic"
  ],
  "uiAlias": "synthetic",
  "color": "#6366F1",
  "image": "/assets/providers/synthetic/icon.svg",
  "website": "https://synthetic.new",
  "notice": {
    "apiKeyUrl": "",
    "text": "Synthetic provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.synthetic.new/openai/v1/chat/completions",
  "baseUrls": [
    "https://api.synthetic.new/openai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "synthetic-default",
      "name": "Synthetic Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
