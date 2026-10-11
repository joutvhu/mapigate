import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "openrouter",
  "name": "OpenRouter",
  "alias": "openrouter",
  "color": "#F97316",
  "image": "/providers/openrouter.png",
  "website": "https://openrouter.ai",
  "notice": {
    "text": "Free tier: 27+ free models, no credit card needed, 200 req/day. After  0 credit: 1,000 req/day.",
    "apiKeyUrl": "https://openrouter.ai/settings/keys"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
  "baseUrls": [
    "https://openrouter.ai/api/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "HTTP-Referer": "https://endpoint-proxy.local",
    "X-Title": "Endpoint Proxy"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "openai/text-embedding-3-large",
      "name": "OpenAI Text Embedding 3 Large",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "openai/text-embedding-3-small",
      "name": "OpenAI Text Embedding 3 Small",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "openai/text-embedding-ada-002",
      "name": "OpenAI Text Embedding Ada 002",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "qwen/qwen3-embedding-8b",
      "name": "Qwen3 Embedding 8B",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "perplexity/pplx-embed-v1-4b",
      "name": "Perplexity Embed V1 4B",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "perplexity/pplx-embed-v1-0.6b",
      "name": "Perplexity Embed V1 0.6B",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "nvidia/llama-nemotron-embed-vl-1b-v2:free",
      "name": "NVIDIA Nemotron Embed VL 1B V2 (Free)",
      "isDefault": false,
      "kind": "embedding"
    },
    {
      "id": "openai/gpt-4o-mini-tts",
      "name": "GPT-4o Mini TTS",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "openai/tts-1-hd",
      "name": "TTS-1 HD",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "openai/tts-1",
      "name": "TTS-1",
      "isDefault": false,
      "kind": "tts"
    },
    {
      "id": "openai/dall-e-3",
      "name": "DALL-E 3 (via OpenRouter)",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "openai/gpt-image-1",
      "name": "GPT Image 1 (via OpenRouter)",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "google/imagen-3.0-generate-002",
      "name": "Imagen 3 (via OpenRouter)",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "black-forest-labs/FLUX.1-schnell",
      "name": "FLUX.1 Schnell (via OpenRouter)",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "google/veo-3.1",
      "name": "Veo 3.1 (via OpenRouter)",
      "isDefault": false,
      "kind": "video"
    },
    {
      "id": "openai/sora-2-pro",
      "name": "Sora 2 Pro (via OpenRouter)",
      "isDefault": false,
      "kind": "video"
    },
    {
      "id": "bytedance/seedance-2.0",
      "name": "Seedance 2.0 (via OpenRouter)",
      "isDefault": false,
      "kind": "video"
    },
    {
      "id": "typesafe/jev-1.13",
      "name": "Jev 1.13",
      "isDefault": false,
      "kind": "systemone"
    }
  ],
  "passthroughModels": true
};

export default provider;
