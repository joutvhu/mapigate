import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "hyperbolic",
  "name": "Hyperbolic",
  "alias": "hyperbolic",
  "aliases": [
    "hyp"
  ],
  "uiAlias": "hyp",
  "color": "#00D4FF",
  "image": "/assets/providers/hyperbolic/icon.png",
  "website": "https://hyperbolic.xyz",
  "notice": {
    "apiKeyUrl": "https://app.hyperbolic.xyz/settings"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.hyperbolic.xyz/v1/chat/completions",
  "baseUrls": [
    "https://api.hyperbolic.xyz/v1/chat/completions"
  ],
  "validateUrl": "https://api.hyperbolic.xyz/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "Qwen/QwQ-32B",
      "name": "QwQ 32B",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-R1",
      "name": "DeepSeek R1",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V3",
      "name": "DeepSeek V3",
      "isDefault": false
    },
    {
      "id": "meta-llama/Llama-3.3-70B-Instruct",
      "name": "Llama 3.3 70B",
      "isDefault": false
    },
    {
      "id": "meta-llama/Llama-3.2-3B-Instruct",
      "name": "Llama 3.2 3B",
      "isDefault": false
    },
    {
      "id": "Qwen/Qwen2.5-72B-Instruct",
      "name": "Qwen 2.5 72B",
      "isDefault": false
    },
    {
      "id": "Qwen/Qwen2.5-Coder-32B-Instruct",
      "name": "Qwen 2.5 Coder 32B",
      "isDefault": false
    },
    {
      "id": "NousResearch/Hermes-3-Llama-3.1-70B",
      "name": "Hermes 3 70B",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
