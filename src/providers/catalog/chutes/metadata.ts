import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "chutes",
  "name": "Chutes AI",
  "alias": "chutes",
  "aliases": [
    "ch"
  ],
  "uiAlias": "ch",
  "color": "#ffffffff",
  "image": "/assets/providers/chutes/icon.png",
  "website": "https://chutes.ai",
  "notice": {
    "apiKeyUrl": "https://chutes.ai/app/api"
  },
  "category": "apikey",
  "baseUrl": "https://llm.chutes.ai/v1/chat/completions",
  "baseUrls": [
    "https://llm.chutes.ai/v1/chat/completions"
  ],
  "validateUrl": "https://llm.chutes.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export const provider = metadata;
export default metadata;
