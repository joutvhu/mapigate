import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "vercel-ai-gateway",
  "name": "Vercel AI Gateway",
  "alias": "vercel-ai-gateway",
  "aliases": [
    "vercel"
  ],
  "uiAlias": "vercel",
  "color": "#111827",
  "image": "/assets/providers/vercel-ai-gateway/icon.png",
  "website": "https://vercel.com/ai-gateway",
  "notice": {
    "text": "Unified OpenAI-compatible endpoint from Vercel. Use your AI Gateway API key, then pick models with provider/model IDs like anthropic/claude-sonnet-4.6 or openai/gpt-5.4.",
    "apiKeyUrl": "https://vercel.com/dashboard/~/ai-gateway"
  },
  "category": "apikey",
  "baseUrl": "https://ai-gateway.vercel.sh/v1/chat/completions",
  "baseUrls": [
    "https://ai-gateway.vercel.sh/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
