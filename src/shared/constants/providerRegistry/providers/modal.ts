import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "modal",
  "name": "Modal",
  "alias": "mdl",
  "aliases": [
    "modal"
  ],
  "uiAlias": "modal",
  "color": "#7C3AED",
  "image": "/providers/modal.svg",
  "website": "https://modal.com/docs",
  "notice": {
    "apiKeyUrl": "",
    "text": "Modal provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.modal.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.modal.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "modal-default",
      "name": "Modal Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
