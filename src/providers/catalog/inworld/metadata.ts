import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "inworld",
  "name": "Inworld TTS",
  "alias": "inworld",
  "color": "#FF6B6B",
  "image": "/assets/providers/inworld/icon.png",
  "website": "https://inworld.ai",
  "notice": {
    "text": "Free tier: 40 minutes/month TTS. Paid: TTS-1.5 Mini $0.01/min ($15/1M chars), TTS-1.5 Max $0.025/min ($30/1M chars). 270+ voices, 15 languages.",
    "apiKeyUrl": "https://platform.inworld.ai/api-keys"
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

export const provider = metadata;
export default metadata;
