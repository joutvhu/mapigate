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
      "id": "meta-llama-3.3-70b-instruct",
      "name": "Llama 3.3 70B Instruct",
      "isDefault": true,
      "contextLength": 131072
    },
    {
      "id": "deepseek-ai/DeepSeek-R1",
      "name": "DeepSeek R1",
      "isDefault": false,
      "contextLength": 163840
    },
    {
      "id": "deepseek-ai/DeepSeek-V3",
      "name": "DeepSeek V3",
      "isDefault": false,
      "contextLength": 163840
    },
    {
      "id": "meta-llama-3.1-70b-instruct",
      "name": "Llama 3.1 70B Instruct",
      "isDefault": false,
      "contextLength": 131072
    },
    {
      "id": "meta-llama-3.1-8b-instruct",
      "name": "Llama 3.1 8B Instruct",
      "isDefault": false,
      "contextLength": 131072
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
