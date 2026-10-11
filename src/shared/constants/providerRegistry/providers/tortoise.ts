import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "tortoise",
  "name": "Tortoise TTS",
  "alias": "tortoise",
  "color": "#7C3AED",
  "image": "/providers/tortoise.png",
  "website": "https://github.com/neonbjb/tortoise-tts",
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
