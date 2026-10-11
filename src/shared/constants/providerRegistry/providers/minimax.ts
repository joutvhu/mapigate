import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "minimax",
  "name": "Minimax Coding",
  "alias": "minimax",
  "color": "#7C3AED",
  "image": "/providers/minimax.png",
  "website": "https://www.minimaxi.com",
  "notice": {
    "apiKeyUrl": "https://platform.minimaxi.com/user-center/basic-information/interface-key"
  },
  "category": "apikey",
  "baseUrl": "https://api.minimax.io/anthropic/v1/messages",
  "baseUrls": [
    "https://api.minimax.io/anthropic/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "Anthropic-Version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "MiniMax-M3",
      "name": "MiniMax M3",
      "isDefault": false
    },
    {
      "id": "MiniMax-M2.7",
      "name": "MiniMax M2.7",
      "isDefault": false
    },
    {
      "id": "MiniMax-M2.5",
      "name": "MiniMax M2.5",
      "isDefault": false
    },
    {
      "id": "MiniMax-M2.1",
      "name": "MiniMax M2.1",
      "isDefault": false
    },
    {
      "id": "minimax-image-01",
      "name": "MiniMax Image 01",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "speech-2.8-hd",
      "name": "Speech 2.8 HD",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "speech-2.8-turbo",
      "name": "Speech 2.8 Turbo",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "speech-2.6-hd",
      "name": "Speech 2.6 HD",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "speech-2.6-turbo",
      "name": "Speech 2.6 Turbo",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "speech-02-hd",
      "name": "Speech 02 HD",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "speech-02-turbo",
      "name": "Speech 02 Turbo",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "speech-01-hd",
      "name": "Speech 01 HD",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "speech-01-turbo",
      "name": "Speech 01 Turbo",
      "isDefault": false,
      "kind": "tts"
    }
  ]
};

export default provider;
