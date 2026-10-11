import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "perplexity-agent",
  "name": "Perplexity Agent",
  "alias": "perplexity-agent",
  "aliases": [
    "pplx-agent",
    "pplx-responses"
  ],
  "uiAlias": "pa",
  "color": "#20808D",
  "image": "/providers/perplexity-agent.png",
  "website": "https://www.perplexity.ai",
  "notice": {
    "text": "Perplexity Agent API exposes GPT, Claude, Gemini, Grok, GLM, Kimi, and Sonar models through one OpenAI-compatible Responses API.",
    "apiKeyUrl": "https://www.perplexity.ai/settings/api"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.perplexity.ai/v1/responses",
  "baseUrls": [
    "https://api.perplexity.ai/v1/responses"
  ],
  "validateUrl": "https://api.perplexity.ai/v1/models",
  "format": "openai-responses",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "perplexity/sonar",
      "name": "Perplexity Sonar",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.5",
      "name": "GPT-5.5",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.4",
      "name": "GPT-5.4",
      "isDefault": false
    },
    {
      "id": "openai/gpt-5.4-mini",
      "name": "GPT-5.4 Mini",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6",
      "isDefault": false
    },
    {
      "id": "anthropic/claude-opus-4-8",
      "name": "Claude Opus 4.8",
      "isDefault": false
    },
    {
      "id": "google/gemini-3.1-pro-preview",
      "name": "Gemini 3.1 Pro",
      "isDefault": false
    },
    {
      "id": "xai/grok-4.20-reasoning",
      "name": "Grok 4.20 Reasoning",
      "isDefault": false
    },
    {
      "id": "perplexity/glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false
    },
    {
      "id": "perplexity/kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "isDefault": false
    },
    {
      "id": "nvidia/nemotron-3-super-120b-a12b",
      "name": "Nemotron 3 Super 120B",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export default provider;
