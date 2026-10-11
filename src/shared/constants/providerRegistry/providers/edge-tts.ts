import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "edge-tts",
  "name": "Edge TTS",
  "alias": "edge-tts",
  "color": "#0078D4",
  "image": "/providers/edge-tts.png",
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
