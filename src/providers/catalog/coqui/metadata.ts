import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "coqui",
  "name": "Coqui TTS",
  "alias": "coqui",
  "color": "#10B981",
  "image": "/assets/providers/coqui/icon.png",
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

export const provider = metadata;
export default metadata;
