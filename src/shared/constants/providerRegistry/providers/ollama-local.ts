import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "ollama-local",
  "name": "Ollama Local",
  "alias": "ollama-local",
  "color": "#ffffffff",
  "image": "/providers/ollama-local.png",
  "website": "https://ollama.com",
  "category": "apikey",
  "baseUrl": "http://localhost:11434/api/chat",
  "baseUrls": [
    "http://localhost:11434/api/chat"
  ],
  "validateUrl": "",
  "format": "ollama",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "hasProviderSpecificData": true,
  "models": []
};

export default provider;
