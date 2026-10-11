import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "jina-reader",
  "name": "Jina Reader",
  "alias": "jina-reader",
  "color": "#000000",
  "image": "/providers/jina-reader.png",
  "website": "https://jina.ai/reader",
  "notice": {
    "apiKeyUrl": "https://jina.ai/?sui=apikey"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export default provider;
