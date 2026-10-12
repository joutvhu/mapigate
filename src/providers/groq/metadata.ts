import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "groq",
  "name": "Groq",
  "alias": "groq",
  "color": "#F55036",
  "image": "/assets/providers/groq/icon.png",
  "website": "https://groq.com",
  "notice": {
    "apiKeyUrl": "https://console.groq.com/keys"
  },
  "category": "apikey",
  "baseUrl": "https://api.groq.com/openai/v1/chat/completions",
  "baseUrls": [
    "https://api.groq.com/openai/v1/chat/completions"
  ],
  "validateUrl": "https://api.groq.com/openai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "llama-3.3-70b-versatile",
      "name": "Llama 3.3 70B",
      "isDefault": false
    },
    {
      "id": "meta-llama/llama-4-maverick-17b-128e-instruct",
      "name": "Llama 4 Maverick",
      "isDefault": false
    },
    {
      "id": "qwen/qwen3-32b",
      "name": "Qwen3 32B",
      "isDefault": false
    },
    {
      "id": "openai/gpt-oss-120b",
      "name": "GPT-OSS 120B",
      "isDefault": false
    },
    {
      "id": "whisper-large-v3",
      "name": "Whisper Large v3",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "whisper-large-v3-turbo",
      "name": "Whisper Large v3 Turbo",
      "isDefault": false,
      "kind": "stt"
    },
    {
      "id": "distil-whisper-large-v3-en",
      "name": "Distil Whisper Large v3 EN",
      "isDefault": false,
      "kind": "stt"
    }
  ]
};

export const provider = metadata;
export default metadata;
