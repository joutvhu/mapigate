import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "gigachat",
  "name": "GigaChat (Sber)",
  "alias": "gigachat",
  "aliases": [
    "gigachat"
  ],
  "uiAlias": "gigachat",
  "color": "#10B981",
  "image": "/providers/gigachat.svg",
  "website": "https://developers.sber.ru",
  "notice": {
    "apiKeyUrl": "",
    "text": "GigaChat (Sber) provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://gigachat.devices.sberbank.ru/api/v1",
  "baseUrls": [
    "https://gigachat.devices.sberbank.ru/api/v1"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "gigachat-default",
      "name": "GigaChat (Sber) Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
