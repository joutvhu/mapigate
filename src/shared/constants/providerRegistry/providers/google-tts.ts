import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "google-tts",
  "name": "Google TTS",
  "alias": "google-tts",
  "color": "#4285F4",
  "image": "/providers/google-tts.png",
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
