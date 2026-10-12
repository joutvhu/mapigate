import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "elevenlabs",
  "name": "ElevenLabs",
  "alias": "el",
  "color": "#6C47FF",
  "image": "/assets/providers/elevenlabs/icon.png",
  "website": "https://elevenlabs.io",
  "notice": {
    "apiKeyUrl": "https://elevenlabs.io/app/settings/api-keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "scribe_v1",
      "name": "Scribe v1",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "scribe_v2",
      "name": "Scribe v2",
      "isDefault": false,
      "kind": "stt"
    }
  ]
};

export const provider = metadata;
export default metadata;
