import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "venice",
  "name": "Venice AI",
  "alias": "venice",
  "aliases": [
    "vn"
  ],
  "uiAlias": "venice",
  "color": "#DC2626",
  "image": "/assets/providers/venice/icon.png",
  "website": "https://venice.ai",
  "notice": {
    "text": "OpenAI-compatible. Private inference + uncensored models (Venice Uncensored, GLM, Qwen, DeepSeek, Llama).",
    "apiKeyUrl": "https://venice.ai/settings/api"
  },
  "category": "apikey",
  "baseUrl": "https://api.venice.ai/api/v1/chat/completions",
  "baseUrls": [
    "https://api.venice.ai/api/v1/chat/completions"
  ],
  "validateUrl": "https://api.venice.ai/api/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
