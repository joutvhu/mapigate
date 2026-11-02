import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "friendliai",
  "name": "FriendliAI",
  "alias": "friendli",
  "aliases": [
    "friendliai"
  ],
  "uiAlias": "friendliai",
  "color": "#EC4899",
  "iconBg": "#2a62db",
  "image": "/assets/providers/friendliai/icon.svg",
  "website": "https://friendli.ai",
  "notice": {
    "apiKeyUrl": "https://suite.friendli.ai/",
    "text": "FriendliAI Serverless endpoints serving open models at high throughput with dedicated or serverless tokens."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.friendli.ai/serverless/v1/chat/completions",
  "baseUrls": [
    "https://api.friendli.ai/serverless/v1/chat/completions"
  ],
  "validateUrl": "https://api.friendli.ai/serverless/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "friendliai-default",
      "name": "FriendliAI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
