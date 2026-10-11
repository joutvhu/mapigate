import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "ollama-cloud",
  "name": "Ollama Cloud",
  "alias": "ollamacloud",
  "aliases": [
    "ollama-cloud"
  ],
  "uiAlias": "ollama-cloud",
  "color": "#58A6FF",
  "image": "/providers/ollama-cloud.svg",
  "website": "https://ollama.com/settings/keys",
  "notice": {
    "apiKeyUrl": "",
    "text": "Ollama Cloud provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://ollama.com/v1/chat/completions",
  "baseUrls": [
    "https://ollama.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "ollama-cloud-default",
      "name": "Ollama Cloud Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
