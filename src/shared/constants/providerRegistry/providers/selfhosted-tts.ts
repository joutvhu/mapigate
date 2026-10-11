import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "selfhosted-tts",
  "name": "Self-hosted TTS",
  "alias": "selfhosted-tts",
  "color": "#ffffffff",
  "image": "/providers/selfhosted-tts.png",
  "website": "https://github.com/remsky/Kokoro-FastAPI",
  "category": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "kokoro",
      "name": "Kokoro (self-hosted)",
      "isDefault": false,
      "kind": "tts"
    }
  ]
};

export default provider;
