import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "coqui",
  "name": "Coqui TTS",
  "alias": "coqui",
  "color": "#10B981",
  "image": "/providers/coqui.png",
  "website": "https://github.com/coqui-ai/TTS",
  "category": "freeTier",
  "authType": "none",
  "noAuth": true,
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export default provider;
