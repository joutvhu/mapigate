import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "deepgram",
  "name": "Deepgram",
  "alias": "deepgram",
  "aliases": [
    "dg"
  ],
  "uiAlias": "dg",
  "color": "#13EF93",
  "image": "/assets/providers/deepgram/icon.png",
  "website": "https://deepgram.com",
  "notice": {
    "text": "$200 free credit on signup (no card required). Aura-1: $0.015/1k chars, Aura-2: $0.030/1k chars (Pay-As-You-Go).",
    "apiKeyUrl": "https://console.deepgram.com/api-keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.deepgram.com/v1/listen",
  "baseUrls": [
    "https://api.deepgram.com/v1/listen"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "nova-3",
      "name": "Nova 3",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "nova-2",
      "name": "Nova 2",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "whisper-large",
      "name": "Whisper Large",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "nova",
      "name": "Nova",
      "isDefault": false,
      "kind": "stt"
    }
  ]
};

export const provider = metadata;
export default metadata;
