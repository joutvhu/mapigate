import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "sensenova",
  "name": "SenseNova",
  "alias": "sensenova",
  "aliases": [
    "sensenova"
  ],
  "uiAlias": "sensenova",
  "color": "#0066FF",
  "image": "/providers/sensenova.svg",
  "website": "https://platform.sensenova.cn",
  "notice": {
    "apiKeyUrl": "https://platform.sensenova.cn/console",
    "text": "SenseNova registration appears to require a Chinese (+86) phone number for SMS verification — no international sign-up path is documented, so users outside mainland China may be unable to obtain an API key."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://token.sensenova.cn/v1/chat/completions",
  "baseUrls": [
    "https://token.sensenova.cn/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "sensenova-default",
      "name": "SenseNova Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
