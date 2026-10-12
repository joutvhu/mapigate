import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "pioneer",
  "name": "Pioneer AI",
  "alias": "pn",
  "aliases": [
    "pioneer"
  ],
  "uiAlias": "pioneer",
  "color": "#7C5CFF",
  "image": "/assets/providers/pioneer/icon.svg",
  "website": "https://pioneer.ai",
  "notice": {
    "apiKeyUrl": "https://agent.pioneer.ai/settings/api-keys",
    "text": "Pioneer AI by Fastino Labs. Use API key auth with a pio_sk_... key. Only open-tier models (Qwen3, Llama, Gemma, SmolLM) work directly — gated models (Claude/GPT/Gemini) require prior fine-tuning via the Pioneer platform. No free tier — paid plans start with $40 of platform credits."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.pioneer.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.pioneer.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "pioneer-default",
      "name": "Pioneer AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
