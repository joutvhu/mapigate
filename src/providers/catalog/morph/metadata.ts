import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "morph",
  "name": "Morph",
  "alias": "morph",
  "aliases": [
    "morphllm"
  ],
  "uiAlias": "morph",
  "color": "#14B8A6",
  "image": "/assets/providers/morph/icon.png",
  "website": "https://morphllm.com",
  "notice": {
    "apiKeyUrl": "https://morphllm.com"
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.morphllm.com/v1/chat/completions",
  "baseUrls": [
    "https://api.morphllm.com/v1/chat/completions"
  ],
  "validateUrl": "https://api.morphllm.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "morph-v3-large",
      "name": "Morph v3 Large",
      "isDefault": false
    },
    {
      "id": "morph-v3-fast",
      "name": "Morph v3 Fast",
      "isDefault": false
    },
    {
      "id": "morph-qwen35-397b",
      "name": "Qwen 3.5 397B (Morph)",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "morph-minimax27-230b",
      "name": "MiniMax M2.7 (Morph)",
      "isDefault": false,
      "contextLength": 200704
    },
    {
      "id": "morph-qwen36-27b",
      "name": "Qwen 3.6 27B (Morph)",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "morph-dsv4flash",
      "name": "DeepSeek V4 Flash (Morph)",
      "isDefault": false,
      "contextLength": 1048576
    }
  ]
};

export const provider = metadata;
export default metadata;
