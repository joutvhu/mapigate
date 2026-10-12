import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "dahl",
  "name": "Dahl Inference",
  "alias": "dahl",
  "aliases": [
    "dahl-inference"
  ],
  "uiAlias": "dahl",
  "color": "#1E40AF",
  "image": "/assets/providers/dahl/icon.png",
  "website": "https://dahl.global",
  "notice": {
    "text": "OpenAI-compatible Gonka inference node. Small, fixed catalogue (GLM-5.3-Flash, DeepSeek-V4-Flash, MiniMax-M2.7) at a flat per-token rate.",
    "apiKeyUrl": "https://dahl.global/dashboard"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://inference.dahl.global/v1/chat/completions",
  "baseUrls": [
    "https://inference.dahl.global/v1/chat/completions"
  ],
  "validateUrl": "https://inference.dahl.global/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "zai-org/GLM-5.3-Flash",
      "name": "GLM-5.3 Flash",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V4-Flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "isDefault": false
    },
    {
      "id": "MiniMaxAI/MiniMax-M2.7",
      "name": "MiniMax M2.7",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
