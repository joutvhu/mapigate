import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "assemblyai",
  "name": "AssemblyAI",
  "alias": "assemblyai",
  "aliases": [
    "aai"
  ],
  "uiAlias": "aai",
  "color": "#0062FF",
  "image": "/providers/assemblyai.png",
  "website": "https://assemblyai.com",
  "notice": {
    "apiKeyUrl": "https://www.assemblyai.com/app/api-keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.assemblyai.com/v1/audio/transcriptions",
  "baseUrls": [
    "https://api.assemblyai.com/v1/audio/transcriptions"
  ],
  "validateUrl": "https://api.assemblyai.com/v1/account",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "universal-3-pro",
      "name": "Universal 3 Pro",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "universal-2",
      "name": "Universal 2",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "best",
      "name": "Best (Nano + Universal)",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "nano",
      "name": "Nano (Fast)",
      "isDefault": false,
      "kind": "stt"
    }
  ]
};

export default provider;
