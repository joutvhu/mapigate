import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "ant-ling",
  "name": "Ant Ling / Ring (inclusionAI)",
  "alias": "ling",
  "aliases": [
    "ant-ling"
  ],
  "uiAlias": "ant-ling",
  "color": "#1677FF",
  "image": "/assets/providers/ant-ling/icon.svg",
  "website": "https://developer.ant-ling.com/en/docs/",
  "notice": {
    "apiKeyUrl": "",
    "text": "Ant Ling / Ring (inclusionAI) provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.ant-ling.com/v1/chat/completions",
  "baseUrls": [
    "https://api.ant-ling.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "ant-ling-default",
      "name": "Ant Ling / Ring (inclusionAI) Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
