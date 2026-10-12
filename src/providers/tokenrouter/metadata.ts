import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "tokenrouter",
  "name": "TokenRouter",
  "alias": "tokenrouter",
  "aliases": [
    "tr"
  ],
  "uiAlias": "tokenrouter",
  "color": "#0EA5E9",
  "image": "/assets/providers/tokenrouter/icon.png",
  "website": "https://www.tokenrouter.com",
  "notice": {
    "text": "OpenAI-compatible gateway. 300+ models (OpenAI, Claude, Gemini, Qwen, DeepSeek, Kimi, GLM, dsb).",
    "apiKeyUrl": "https://www.tokenrouter.com"
  },
  "category": "apikey",
  "baseUrl": "https://api.tokenrouter.com/v1/chat/completions",
  "baseUrls": [
    "https://api.tokenrouter.com/v1/chat/completions"
  ],
  "validateUrl": "https://api.tokenrouter.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "high",
  "thinkingOptions": [
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
  ],
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
