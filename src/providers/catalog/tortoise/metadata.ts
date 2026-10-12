import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "tortoise",
  "name": "Tortoise TTS",
  "alias": "tortoise",
  "color": "#7C3AED",
  "image": "/assets/providers/tortoise/icon.png",
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

export const provider = metadata;
export default metadata;
