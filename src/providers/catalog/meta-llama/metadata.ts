import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "meta-llama",
  "name": "Meta Llama API",
  "alias": "meta",
  "aliases": [
    "meta-llama"
  ],
  "uiAlias": "meta-llama",
  "color": "#0F766E",
  "image": "/assets/providers/meta-llama/icon.svg",
  "website": "https://llama.developer.meta.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "Meta Llama API provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.llama.com/compat/v1/chat/completions",
  "baseUrls": [
    "https://api.llama.com/compat/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "meta-llama-default",
      "name": "Meta Llama API Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
