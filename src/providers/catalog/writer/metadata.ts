import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "writer",
  "name": "Writer",
  "alias": "writer",
  "aliases": [
    "writer"
  ],
  "uiAlias": "writer",
  "color": "#111827",
  "iconBg": "#FFFFFF",
  "image": "/assets/providers/writer/icon.svg",
  "website": "https://dev.writer.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "Writer provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.writer.com/v1/chat/completions",
  "baseUrls": [
    "https://api.writer.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "writer-default",
      "name": "Writer Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
