import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "perplexity-agent",
  "name": "Perplexity Agent",
  "alias": "perplexity-agent",
  "aliases": [
    "pplx-agent",
    "pplx-responses"
  ],
  "uiAlias": "pa",
  "color": "#20808D",
  "iconBg": "#000000",
  "image": "/assets/providers/perplexity-agent/icon.png",
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
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
