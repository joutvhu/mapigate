import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "ollama-search",
  "name": "Ollama Search",
  "alias": "ollama-search",
  "color": "#ffffff",
  "image": "/assets/providers/ollama-search/icon.png",
  "website": "https://ollama.com",
  "notice": {
    "text": "Web search via Ollama Cloud subscription. Reuses the API key from the Ollama (chat) provider.",
    "apiKeyUrl": "https://ollama.com/settings/keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export const provider = metadata;
export default metadata;
