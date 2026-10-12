import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "atria",
  "name": "Atria Dawn",
  "alias": "atria",
  "aliases": [
    "atria-asi"
  ],
  "uiAlias": "atria",
  "color": "#C2410C",
  "image": "/assets/providers/atria/icon.png",
  "website": "https://atria-asi.ai",
  "notice": {
    "text": "OpenAI-compatible endpoint from Atria Dawn (AtomInnoLab). Currently a research preview offering a single text model, Atria-Dawn-Preview.",
    "apiKeyUrl": "https://api.atria-asi.ai/dashboard"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.atria-asi.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.atria-asi.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.atria-asi.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "Atria-Dawn-Preview",
      "name": "Atria Dawn Preview",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
