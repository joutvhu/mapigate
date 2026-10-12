import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "ollama-local",
  "name": "Ollama Local",
  "alias": "ollama-local",
  "color": "#ffffffff",
  "iconBg": "#FFFFFF",
  "image": "/assets/providers/ollama-local/icon.png",
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

export const provider = metadata;
export default metadata;
